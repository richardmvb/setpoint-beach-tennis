import { computed, DestroyRef, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { exportTournamentBackup } from '../../../core/backup-export';
import { FinalsService, type PodiumPlace } from '../../../core/finals.service';
import type { PlayerGender, TournamentState } from '../../../core/models';
import { NpsFeedbackService } from '../../../core/nps-feedback.service';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { APP_CONFIG } from '../../../core/ports/app-config.port';
import { AUTH } from '../../../core/ports/auth.port';
import { CLOCK } from '../../../core/ports/clock.port';
import { DASHBOARD } from '../../../core/ports/dashboard.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { TOURNAMENT_FEED } from '../../../core/ports/live-feed.port';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../../../core/ports/tournaments.port';
import { URL_STATE } from '../../../core/routing/url-state';
import { ShareCardService } from '../../../core/share-card.service';
import { type TournamentPhase, tournamentPhase } from '../../../core/state-machines';
import { StorageService } from '../../../core/storage.service';
import { isGroupTournament, isMixedDoubles } from '../../../domain/tournament-view/format';
import { groupTables } from '../../../domain/tournament-view/group-tables';
import {
  completedMatches,
  elapsedLabel,
  progressPercent,
  totalMatches,
} from '../../../domain/tournament-view/progress';
import { historyRounds, spotlightRound, viewerRounds } from '../../../domain/tournament-view/rounds';
import type { FinalWinnerSide } from '../../../domain/tournament-view/scoring';
import { normalizeSharedState } from '../../../domain/tournament-view/shared-state';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import { ProjectionController } from '../../tournament/projection/projection-controller';
import type { SharedViewError } from './shared-view-errors';
import {
  adminSource,
  type InviteSource,
  inviteSource,
  liveSource,
  type SharedViewMode,
  type SharedViewSource,
  type ViewSnapshot,
} from './shared-view-source';
import { type UpdateTarget, updateTarget } from './update-target';

/** How often the page re-reads the tournament, in case the realtime notice does not arrive. */
export const POLL_MS = 4000;

/** What the hero card says about the tournament. Every field is data; the template picks the text. */
export interface ArenaView {
  name: string;
  groups: boolean;
  size: number;
  kicker: 'adminArchive' | 'archived' | 'live' | 'shared';
  badge: 'archived' | 'finished' | 'live' | 'ongoing' | 'soon';
  status: 'archived' | 'finished' | 'following' | 'waiting' | 'registration' | 'ready' | 'active' | 'completed';
  live: boolean;
  completedMatches: number;
  totalMatches: number;
  players: number;
  /** Null when the clock is not shown (not started, or archived). */
  elapsed: string | null;
  phase: TournamentPhase;
  progress: number;
}

/** A result moved the guest's chance for the chosen goal. The template writes the sentence. */
export interface ChanceToast {
  tone: 'up' | 'down' | 'clinched' | 'eliminated';
  goal: number;
  headline: string;
  detail: string;
  from: string;
  to: string;
}

/** Placeholder for the projection before the tournament arrives (nothing renders it then). */
const NO_TOURNAMENT: TournamentState = {
  version: 1,
  name: '',
  size: 8,
  courts: 2,
  gamesToWin: 4,
  roundCount: 7,
  players: [],
  rounds: [],
  createdAt: '',
};

/**
 * The state of the shared-view page (live link, invite, admin viewer). Provided by `SharedViewComponent`, so it lives
 * and dies with the page: its poll, clock and realtime watch stop when the page is destroyed.
 */
@Injectable()
export class SharedViewStore {
  private readonly auth = inject(AUTH);
  private readonly feed = inject(TOURNAMENT_FEED);
  private readonly clock = inject(CLOCK);
  private readonly local = inject(LOCAL_STORE);
  private readonly analytics = inject(ANALYTICS);
  private readonly finals = inject(FinalsService);
  private readonly shareCard = inject(ShareCardService);
  private readonly nps = inject(NpsFeedbackService);
  private readonly projection = inject(ProjectionController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly url = inject(URL_STATE).snapshot();
  private readonly config = inject(APP_CONFIG);
  private readonly profile = inject(StorageService).loadProfile();
  private readonly standingsMemo = createStandingsMemo();
  private readonly winnerSide: FinalWinnerSide = (match) => this.finals.winnerSide(match);

  readonly mode: SharedViewMode = this.url.dashboardViewerId ? 'admin' : this.url.liveToken ? 'live' : 'invite';
  private readonly source: SharedViewSource | null = this.createSource();
  private readonly invite: InviteSource | null = this.source?.mode === 'invite' ? (this.source as InviteSource) : null;
  readonly versionLabel = this.config.buildVersion ? `v${this.config.buildVersion}` : 'dev';

  readonly snapshot = signal<ViewSnapshot | null>(null);
  /** The tournament ready to render. Null until the first read: the page never shows another tournament meanwhile. */
  readonly tournament = computed<TournamentState | null>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    const state = normalizeSharedState({
      ...snapshot,
      capacity: snapshot.state.size,
      inviteExpiresAt: '',
      expiresAt: null,
    });
    return { ...state, hostingMode: this.source?.hostingMode ?? 'shared' };
  });
  readonly status = computed(() => this.snapshot()?.status ?? null);
  /** A join is in flight. */
  readonly loading = signal(false);
  readonly error = signal<SharedViewError | null>(null);
  readonly guestName = signal('');
  /** Filled from this device's profile, like the name. */
  readonly guestGender = signal<PlayerGender | ''>(this.profile.gender ?? '');
  readonly guestAvatar = signal(this.profile.photoDataUrl ?? '');
  readonly joined = signal(false);
  /** The guest page is one scrolling page; the projection replaces it while open. */
  readonly tab = signal<'main' | 'projection'>('main');
  readonly updateCount = signal(0);
  readonly now = signal(this.clock.now());
  readonly chanceToast = signal<ChanceToast | null>(null);
  readonly showConfetti = signal(false);
  readonly backupExported = signal(false);

  readonly standings = computed(() => {
    const state = this.tournament();
    return state ? this.standingsMemo(state) : null;
  });
  readonly groupTables = computed(() => {
    const state = this.tournament();
    const standings = this.standings();
    return state && standings ? groupTables(state, standings.all) : [];
  });
  readonly rounds = computed(() => {
    const state = this.tournament();
    const visible = state ? viewerRounds(state) : [];
    const spotlight = spotlightRound(visible);
    return { visible, spotlight, history: historyRounds(visible, spotlight) };
  });
  /** Matched by name, exactly as the guest typed it when joining (case and outer spaces ignored). */
  readonly guestPlayerId = computed(() => {
    const name = this.guestName().trim().toLowerCase();
    return this.tournament()?.players.find((player) => player.name.trim().toLowerCase() === name)?.id ?? '';
  });
  readonly guestPlace = computed(() => {
    const state = this.tournament();
    const standings = this.standings();
    const playerId = this.guestPlayerId();
    return state && standings && playerId ? this.shareCard.placementOf(state, standings.all, playerId) : 0;
  });
  readonly canJoin = computed(() => this.mode === 'invite' && !!this.snapshot()?.canJoin && !this.joined());
  readonly mixedDoubles = computed(() => {
    const state = this.tournament();
    return !!state && isMixedDoubles(state);
  });
  /** Changes only when the podium does, so a poll does not re-render (and re-animate) it. */
  private readonly podiumKey = computed(() => {
    const finals = this.tournament()?.finals;
    return finals?.complete ? finals.podiumPlayerIds.join('|') : '';
  });
  readonly podium = computed<PodiumPlace[]>(() => {
    const key = this.podiumKey();
    const finals = untracked(() => this.tournament()?.finals);
    return key && finals ? this.finals.podium(finals) : [];
  });
  readonly arena = computed<ArenaView | null>(() => {
    const state = this.tournament();
    const status = this.status();
    if (!state || !status) return null;
    const following = this.mode !== 'invite';
    const live =
      !state.finishedAt &&
      state.rounds.length > 0 &&
      (following || status === 'active') &&
      status !== 'archived' &&
      status !== 'completed';
    return {
      name: state.name,
      groups: isGroupTournament(state),
      size: state.size,
      kicker:
        status === 'archived' ? (this.mode === 'admin' ? 'adminArchive' : 'archived') : following ? 'live' : 'shared',
      badge:
        status === 'archived'
          ? 'archived'
          : state.finishedAt
            ? 'finished'
            : live
              ? 'live'
              : state.rounds.length
                ? 'ongoing'
                : 'soon',
      status:
        status === 'archived'
          ? 'archived'
          : following
            ? state.finishedAt
              ? 'finished'
              : state.rounds.length
                ? 'following'
                : 'waiting'
            : status,
      live,
      completedMatches: completedMatches(state, this.winnerSide),
      totalMatches: totalMatches(state),
      players: state.players.length,
      elapsed: state.startedAt && status !== 'archived' ? elapsedLabel(state, this.now()) : null,
      phase: tournamentPhase(state),
      progress: progressPercent(state, this.winnerSide),
    };
  });

  private signature = '';
  private firstUpdateTarget: UpdateTarget | '' = '';
  private stopWatch: (() => void) | null = null;
  private destroyed = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    this.projection.connect({
      state: () => this.tournament() ?? NO_TOURNAMENT,
      standings: () => this.standings()?.all ?? [],
      playerId: () => this.guestPlayerId(),
      isGuest: true,
      viewing: () => this.tab() === 'projection',
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stopWatching();
      for (const timer of this.timers) clearTimeout(timer);
    });
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const state = this.tournament();
        if (state?.startedAt && !state.finishedAt) this.now.set(this.clock.now());
      });
    interval(POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.poll());
    void this.load();
  }

  async join(): Promise<void> {
    const name = this.guestName().trim();
    if (!this.invite || !name) return;
    if (this.mixedDoubles() && !this.guestGender()) {
      this.error.set({ key: 'chooseCategory' });
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const snapshot = await this.invite.join(name, this.guestGender() || 'male', this.guestAvatar() || undefined);
      this.guestName.set(name);
      this.joined.set(true);
      this.apply(snapshot, false);
      this.watch(snapshot);
      const state = this.tournament();
      this.analytics.capture('shared_tournament_joined', {
        tournament_mode: state?.tournamentMode,
        doubles_format: state?.doublesFormat ?? 'open',
        tournament_size: state?.size,
        participant_count: state?.players.length,
      });
    } catch (error) {
      this.error.set(this.invite.describeError(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Back to the scrolling page. True when it was showing the projection (the page then scrolls without animation). */
  showMain(): boolean {
    if (this.tab() !== 'projection') return false;
    this.tab.set('main');
    this.projection.leave();
    return true;
  }

  /** True when the projection opened (it stays closed, with a hint, while it is locked). */
  openProjection(): boolean {
    if (!this.projection.open()) return false;
    this.tab.set('projection');
    this.chanceToast.set(null);
    return true;
  }

  openFromChanceToast(): boolean {
    this.analytics.capture('chance_notification_opened', { tone: this.chanceToast()?.tone });
    this.chanceToast.set(null);
    return this.openProjection();
  }

  /** The section the first unseen update changed; the counter starts again. */
  takeFirstUpdate(): UpdateTarget | '' {
    const target = this.firstUpdateTarget;
    this.updateCount.set(0);
    this.firstUpdateTarget = '';
    return target;
  }

  exportBackup(): void {
    const state = this.tournament();
    if (!state) return;
    exportTournamentBackup(state, this.clock, this.analytics);
    this.backupExported.set(true);
  }

  private createSource(): SharedViewSource | null {
    const configured = this.auth.configured;
    if (this.mode === 'admin') {
      const source = this.url.dashboardViewerSource;
      return configured && source
        ? adminSource(inject(DASHBOARD), this.feed, source, this.url.dashboardViewerId)
        : null;
    }
    if (!configured) return null;
    return this.mode === 'live'
      ? liveSource(inject(LOCAL_LIVE), this.feed, this.url.liveToken)
      : inviteSource(inject(SHARED_TOURNAMENTS), this.feed, this.url.inviteToken);
  }

  private async load(): Promise<void> {
    const source = this.source;
    if (!source) {
      this.error.set({
        key:
          this.mode === 'admin'
            ? 'adminUnavailable'
            : this.mode === 'live'
              ? 'liveNotConfigured'
              : 'sharedNotConfigured',
      });
      return;
    }
    try {
      const { snapshot, guestName } = await source.load();
      this.guestName.set(guestName || this.profile.name);
      this.joined.set(!!guestName);
      this.apply(snapshot, false);
      this.watch(snapshot);
    } catch (error) {
      this.error.set(source.describeError(error));
    }
  }

  private poll(): void {
    const source = this.source;
    if (!source || document.hidden || this.loading() || !source.isOpen(this.status())) return;
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const source = this.source;
    if (!source) return;
    try {
      const snapshot = await source.refresh();
      if (this.apply(snapshot, true)) this.error.set(null);
    } catch (error) {
      this.error.set(source.describeError(error));
    }
  }

  /** Shows a snapshot unless nothing changed. False when it was the same as the one on screen. */
  private apply(snapshot: ViewSnapshot, isUpdate: boolean): boolean {
    const signature = JSON.stringify([snapshot.status, snapshot.state]);
    if (signature === this.signature) return false;
    this.signature = signature;
    const previous = this.tournament();
    this.snapshot.set(snapshot);
    const next = this.tournament();
    if (isUpdate && previous && next) {
      if (this.updateCount() === 0) this.firstUpdateTarget = updateTarget(previous, next);
      this.updateCount.update((count) => count + 1);
    }
    // An invite guest whose tournament just ended is asked for feedback once.
    if (this.mode === 'invite' && previous && !previous.finishedAt && snapshot.state.finishedAt)
      this.later(() => void this.nps.open(true), 0);
    if (!this.source?.isOpen(snapshot.status)) this.stopWatching();
    this.checkChanceChange();
    return true;
  }

  private watch(snapshot: ViewSnapshot): void {
    // A read can resolve after the page is gone: a watch opened then would never be stopped.
    if (this.destroyed || !this.source?.isOpen(snapshot.status)) return;
    this.stopWatching();
    this.stopWatch = this.source.watch(snapshot.id, () => void this.refresh());
  }

  private stopWatching(): void {
    this.stopWatch?.();
    this.stopWatch = null;
  }

  /** Tells a watching guest when a result moved their chance (or settled it), without any server involved. */
  private checkChanceChange(): void {
    const state = this.tournament();
    const playerId = this.guestPlayerId();
    if (!state || !playerId) return;
    const goal = this.projection.currentGoal;
    if (!goal) return;
    // Stored data: the key's shape must not change.
    const key = `setpoint.chance.${state.sharedTournamentId ?? ''}.${playerId}.${goal.goal}`;
    let previous: { p: number; s: string } | null;
    try {
      previous = JSON.parse(this.local.getItem(key) ?? 'null') as { p: number; s: string } | null;
    } catch {
      previous = null;
    }
    try {
      this.local.setItem(key, JSON.stringify({ p: goal.probability, s: goal.status }));
    } catch {
      /* sem armazenamento */
    }
    if (!previous || this.tab() === 'projection') return;
    const toast = {
      goal: goal.goal,
      headline: goal.headline,
      detail: goal.detail,
      from: this.projection.formatChance(previous.p),
      to: this.projection.formatChance(goal.probability),
    };
    if (goal.status === 'clinched' && previous.s !== 'clinched') {
      this.showChanceToast({ ...toast, tone: 'clinched' });
      this.showConfetti.set(true);
      this.later(() => this.showConfetti.set(false), 3200);
    } else if (goal.status === 'eliminated' && previous.s !== 'eliminated') {
      this.showChanceToast({ ...toast, tone: 'eliminated' });
    } else {
      const delta = goal.probability - previous.p;
      if (Math.abs(delta) >= 0.05) this.showChanceToast({ ...toast, tone: delta > 0 ? 'up' : 'down' });
    }
  }

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private showChanceToast(toast: ChanceToast): void {
    this.chanceToast.set(toast);
    this.analytics.capture('chance_notification_shown', { tone: toast.tone });
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.timers.delete(this.toastTimer);
    }
    this.toastTimer = this.later(() => this.chanceToast.set(null), 7000);
  }

  private later(run: () => void, ms: number): ReturnType<typeof setTimeout> | null {
    if (this.destroyed) return null;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
}
