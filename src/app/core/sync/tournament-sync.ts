import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { CurrentTournament } from '../current-tournament';
import type { SharedTournamentSnapshot, TournamentState } from '../models';
import { OfflineSyncQueue, type SyncKind } from '../offline-sync-queue';
import { OwnedSharedTournament } from '../owned-shared-tournament';
import { CLOCK } from '../ports/clock.port';
import { CONNECTIVITY } from '../ports/connectivity.port';
import { LOCAL_STORE } from '../ports/key-value-store.port';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../ports/tournaments.port';
import { publicTournamentState } from '../public-tournament-state';
import { AppNavigation } from '../routing/app-navigation';
import { ShellContext } from '../shell-context';
import { LocalLiveLink } from '../local-live-link';
import { syncStatus } from '../state-machines';
import { StorageService } from '../storage.service';

const SYNC_PAUSED_KEY = 'setpoint.sync.paused';

/** Why the last sync step failed, as a key; `SyncErrorText` turns it into words. */
export type SyncErrorKey =
  | 'queueUnavailable'
  | 'prefsNotSaved'
  | 'prepareFailed'
  | 'notStaged'
  | 'queueNotSaved'
  | 'queueNotCleared'
  | 'conflict'
  | 'expired'
  | 'failed';

const STAGE_DELAY = 250;
const POLL_EVERY = 4000;
const RETRY_AFTER = 15000;

/**
 * Keeps this device's tournament and the server in step while the person scores: the offline queue (`setpoint.sync.*`),
 * the loop that sends what is pending, the pause preference and the connection. It reads the tournament, the page
 * and the links as signals, so what it says (`status`, `hasPending`, `error`) is a signal too. `ShellStartup` starts
 * the poll and the reconnect run; `TournamentPersistence` stages every save.
 */
@Injectable({ providedIn: 'root' })
export class TournamentSync {
  private readonly tournament = inject(CurrentTournament);
  private readonly context = inject(ShellContext);
  private readonly navigation = inject(AppNavigation);
  private readonly liveLink = inject(LocalLiveLink);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly connectivity = inject(CONNECTIVITY);
  private readonly local = inject(LOCAL_STORE);
  private readonly clock = inject(CLOCK);
  private readonly shared = inject(SHARED_TOURNAMENTS);
  private readonly localLive = inject(LOCAL_LIVE);
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);
  private readonly queue = new OfflineSyncQueue(this.local);

  private readonly pausedState = signal(false);
  private readonly inFlightState = signal(false);
  private readonly onlineState = signal(this.connectivity.online());
  private readonly errorState = signal<SyncErrorKey | null>(null);
  /** Bumped by every write to the queue, so `hasPending` follows it. */
  private readonly queueRevision = signal(0);
  private retryAfter = 0;
  private stageTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly paused = this.pausedState.asReadonly();
  readonly inFlight = this.inFlightState.asReadonly();
  readonly online = this.onlineState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Where this tournament syncs to: the shared tournament it moderates, or its public live link. */
  readonly target = computed<{ kind: SyncKind; id: string } | null>(() => {
    if (this.context.isSharedView || this.navigation.dashboardRoute()) return null;
    const state = this.tournament.state();
    if (state.hostingMode === 'shared' && state.sharedTournamentId)
      return { kind: 'shared', id: state.sharedTournamentId };
    if (state.hostingMode !== 'shared' && state.analyticsId) return { kind: 'local', id: state.analyticsId };
    return null;
  });
  readonly available = computed(() => {
    if (this.navigation.dashboardRoute()) return false;
    const state = this.tournament.state();
    return state.hostingMode === 'shared'
      ? this.owned.moderator() && !!state.sharedTournamentId && !!state.rounds.length
      : !!this.liveLink.writeToken();
  });
  readonly hasPending = computed(() => {
    this.queueRevision();
    const target = this.target();
    try {
      return !!target && !!this.queue.read(target.kind, target.id)?.pending;
    } catch {
      return false;
    }
  });
  readonly status = computed(() =>
    syncStatus({
      available: this.available(),
      error: !!this.errorState(),
      online: this.onlineState(),
      paused: this.pausedState(),
      inFlight: this.inFlightState(),
      hasPending: this.hasPending(),
    }),
  );

  constructor() {
    const stopListening = this.connectivity.onChange((online) => this.onlineState.set(online));
    this.owned.applied$.subscribe(({ snapshot }) => this.prepareBase(snapshot));
    inject(DestroyRef).onDestroy(() => {
      stopListening();
      this.stop();
    });
  }

  /** Starts the 4 s poll that retries what is pending and refreshes a shared tournament that has not started. */
  start(): void {
    this.pollTimer ??= setInterval(() => this.poll(), POLL_EVERY);
  }

  stop(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    if (this.stageTimer !== null) clearTimeout(this.stageTimer);
    this.pollTimer = null;
    this.stageTimer = null;
  }

  /** Reads what the device kept: the pause preference and, after a reload, what was still waiting to be sent. */
  restore(): void {
    try {
      this.pausedState.set(this.local.getItem(SYNC_PAUSED_KEY) === 'true');
      if (!this.navigation.dashboardRoute()) {
        const state = this.tournament.state();
        const kind: SyncKind = state.hostingMode === 'shared' ? 'shared' : 'local';
        const id = kind === 'shared' ? state.sharedTournamentId : state.analyticsId;
        const record = id ? this.queue.read(kind, id) : null;
        const restored = record?.pending ?? state;
        if (record?.pending) this.tournament.set(restored);
        if (kind === 'shared' && record && restored.sharedStatus === 'active' && restored.rounds.length)
          this.owned.setModerator(true);
      }
    } catch {
      this.errorState.set('queueUnavailable');
    }
  }

  /** The live link stored for the tournament in use: its scores then go through the queue. */
  restoreLiveLink(): void {
    const state = this.tournament.state();
    const id = state.analyticsId;
    if (!id || !this.liveLink.restore(state)) return;
    try {
      this.initialize('local', id, publicTournamentState(state));
    } catch {
      /* the link stays; the sync starts once the browser storage can be written */
    }
  }

  initialize(kind: SyncKind, id: string, base: TournamentState): void {
    try {
      this.queue.initialize(kind, id, base);
    } finally {
      this.touched();
    }
  }

  /**
   * Whether the tournament in use has changes still to be sent, read from the queue now. `hasPending` is cached and
   * follows this tab's writes only; before throwing the queue away, ask this (another tab may have written to it).
   */
  pendingNow(): boolean {
    const target = this.target();
    try {
      return !!target && !!this.queue.read(target.kind, target.id)?.pending;
    } catch {
      return false;
    } finally {
      this.touched();
    }
  }

  /** Records a failure the person should see (the live link could not start its queue, for example). */
  fail(key: SyncErrorKey): void {
    this.errorState.set(key);
  }

  /** Whether the queue holds changes still to be sent for a tournament. */
  hasPendingFor(kind: SyncKind, id: string): boolean {
    return !!this.queue.read(kind, id)?.pending;
  }

  /** Forgets the queue of the tournament in use (it is being left). */
  removeCurrent(): void {
    const target = this.target();
    try {
      if (target) this.queue.remove(target.kind, target.id);
    } catch {
      this.errorState.set('queueNotCleared');
    } finally {
      this.touched();
    }
  }

  /** Drops the queue of the tournament in use before another one takes its place. False when it cannot be done. */
  discardCurrentExcept(importedAnalyticsId: string | undefined): boolean {
    const target = this.target();
    if (target && (this.pendingNow() || target.kind !== 'local' || target.id !== importedAnalyticsId)) {
      try {
        this.queue.remove(target.kind, target.id);
      } catch {
        return false;
      } finally {
        this.touched();
      }
    }
    return true;
  }

  clearError(): void {
    this.errorState.set(null);
  }

  /** Puts the tournament in the queue after a save and sends it soon. True when it was queued. */
  stage(state: TournamentState): boolean {
    const target = this.target();
    if (!target || !this.available() || (target.kind === 'shared' && state.sharedStatus !== 'active')) return false;
    let queued = false;
    try {
      queued = this.queue.stage(target.kind, target.id, state);
      if (!queued) this.errorState.set('notStaged');
    } catch {
      this.errorState.set('queueNotSaved');
    } finally {
      this.touched();
    }
    if (queued) {
      if (this.stageTimer !== null) clearTimeout(this.stageTimer);
      this.stageTimer = setTimeout(() => {
        this.stageTimer = null;
        void this.run();
      }, STAGE_DELAY);
    }
    return queued;
  }

  setPaused(paused: boolean): void {
    this.pausedState.set(paused);
    try {
      this.local.setItem(SYNC_PAUSED_KEY, String(paused));
    } catch {
      this.errorState.set('prefsNotSaved');
    }
    if (!paused) {
      this.retryAfter = 0;
      void this.run();
    }
  }

  syncNow(): void {
    this.retryAfter = 0;
    void this.run(true);
  }

  /** Sends what is pending, one revision at a time, until nothing is. `manual` sends even while paused. */
  async run(manual = false): Promise<void> {
    if (this.inFlightState() || !this.onlineState() || (this.pausedState() && !manual)) return;
    const target = this.target();
    if (
      !target ||
      (target.kind === 'shared' && !this.owned.moderator()) ||
      (target.kind === 'local' && !this.liveLink.writeToken())
    )
      return;
    this.inFlightState.set(true);
    try {
      while (this.target()?.kind === target.kind && this.target()?.id === target.id) {
        const record = this.queue.read(target.kind, target.id);
        if (!record?.pending) break;
        const snapshot =
          target.kind === 'shared'
            ? await this.shared.syncSharedTournament(target.id, record.base, record.pending)
            : await this.localLive.syncLocalLiveTournament(this.liveLink.writeToken(), record.base, record.pending);
        this.queue.acknowledge(target.kind, target.id, record.revision, snapshot.state);
        this.touched();
        if (target.kind === 'shared' && this.tournament.state().sharedTournamentId === target.id) {
          this.tournament.update((state) => ({ ...state, sharedStatus: snapshot.status }));
          if (this.owned.snapshot()?.id === snapshot.id)
            this.owned.replaceSnapshot(snapshot as SharedTournamentSnapshot);
          this.storage.saveTournament(this.tournament.state());
        }
        this.errorState.set(null);
        this.retryAfter = 0;
        if (this.pausedState() && !manual) break;
      }
    } catch (error) {
      this.errorState.set(errorKey(error));
      this.retryAfter = this.clock.now() + RETRY_AFTER;
    } finally {
      this.inFlightState.set(false);
      this.touched();
    }
  }

  /** Makes sure the shared tournament appears (guests joining) even when realtime does not say so. */
  private poll(): void {
    if (this.document.hidden || this.owned.loading()) return;
    if (this.hasPending() && this.clock.now() >= this.retryAfter) void this.run();
    const state = this.tournament.state();
    if (this.owned.moderator() && state.sharedTournamentId && !state.rounds.length)
      void this.owned.refresh(state.sharedTournamentId);
  }

  /** The server's snapshot of an active shared tournament becomes the base the next changes are compared to. */
  private prepareBase(snapshot: SharedTournamentSnapshot): void {
    if (!this.owned.moderator() || snapshot.status !== 'active' || !snapshot.state.rounds?.length) return;
    try {
      this.queue.refreshBase('shared', snapshot.id, snapshot.state);
    } catch {
      this.errorState.set('prepareFailed');
    } finally {
      this.touched();
    }
  }

  private touched(): void {
    this.queueRevision.update((revision) => revision + 1);
  }
}

function errorKey(error: unknown): SyncErrorKey {
  const detail = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  if (detail.includes('sync_conflict')) return 'conflict';
  if (detail.includes('expired') || detail.includes('tournament_completed') || detail.includes('tournament_archived'))
    return 'expired';
  return 'failed';
}
