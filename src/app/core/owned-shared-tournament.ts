import { computed, inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { normalizeSharedState } from '../domain/tournament-view/shared-state';
import { CurrentTournament } from './current-tournament';
import type { PlayerGender, SharedTournamentSnapshot, TournamentState } from './models';
import { ANALYTICS } from './ports/analytics.port';
import { AUTH } from './ports/auth.port';
import { TOURNAMENT_FEED } from './ports/live-feed.port';
import { LOCAL_STORE, SESSION_STORE } from './ports/key-value-store.port';
import { SHARED_TOURNAMENTS } from './ports/tournaments.port';
import { URL_STATE } from './routing/url-state';
import { moderatorAuthError, type SharedError, sharedError } from './shared-errors';

/** The key an older version kept the shared setup under; it is cleared when the app starts. */
export const SHARED_SETUP_KEY = 'setpoint.shared.setup';
const OWNER_INVITE_KEY = 'setpoint.shared.ownerInvite';

export type OwnedNotice = 'created' | 'copied' | 'renewed';

/** A snapshot became the current tournament. `keepView` is true when only the data changed (a guest joined). */
export interface SharedApplied {
  snapshot: SharedTournamentSnapshot;
  keepView: boolean;
}

export interface ModeratorProfile {
  name: string;
  gender: PlayerGender | '';
  avatar: string;
}

/**
 * The shared tournament this device's moderator owns: who is its moderator, its latest snapshot, the invite, and the
 * calls that change it (create, add or remove a participant, a new invite, cancel). The setup wizard, the overview's
 * invite card and the sync code all read it, so it is a root service. The tournament itself stays in
 * `CurrentTournament`; `apply` puts a snapshot there. The invite token is kept per tournament in `LOCAL_STORE`.
 */
@Injectable({ providedIn: 'root' })
export class OwnedSharedTournament {
  private readonly auth = inject(AUTH);
  private readonly repository = inject(SHARED_TOURNAMENTS);
  private readonly feed = inject(TOURNAMENT_FEED);
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);
  private readonly urlState = inject(URL_STATE);
  private readonly analytics = inject(ANALYTICS);
  private readonly tournament = inject(CurrentTournament);
  private stopWatch: (() => void) | null = null;
  private signature = '';

  private readonly isModerator = signal(false);
  private readonly latest = signal<SharedTournamentSnapshot | null>(null);
  private readonly token = signal('');
  private readonly busy = signal(false);
  private readonly failure = signal<SharedError | null>(null);
  private readonly message = signal<OwnedNotice | null>(null);

  readonly moderator = this.isModerator.asReadonly();
  readonly snapshot = this.latest.asReadonly();
  readonly inviteToken = this.token.asReadonly();
  readonly inviteUrl = computed(() => (this.token() ? this.urlState.inviteUrl(this.token()) : ''));
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly notice = this.message.asReadonly();

  /** Emits after `apply` made a snapshot the current tournament (the sync prepares its base, the shell moves page). */
  readonly applied$ = new Subject<SharedApplied>();

  /** Whether the cloud backend is set up for this deploy; the shared mode needs it. */
  get configured(): boolean {
    return this.auth.configured;
  }

  setModerator(value: boolean): void {
    this.isModerator.set(value);
  }

  clearMessages(): void {
    this.failure.set(null);
    this.message.set(null);
  }

  /** Records a failure the person should see on the setup page (for example a message the wizard itself found). */
  fail(error: SharedError): void {
    this.failure.set(error);
  }

  /** Keeps a snapshot without making it the current tournament (the device has changes still to be sent). */
  replaceSnapshot(snapshot: SharedTournamentSnapshot): void {
    this.latest.set(snapshot);
    this.signature = JSON.stringify([snapshot.status, snapshot.state]);
  }

  /** Makes the server's snapshot the current tournament. */
  apply(snapshot: SharedTournamentSnapshot, keepView = false): void {
    this.replaceSnapshot(snapshot);
    this.tournament.set(normalizeSharedState(snapshot));
    this.applied$.next({ snapshot, keepView });
  }

  /**
   * Creates the shared tournament for `draft` (signing in without an e-mail first, if needed), makes it current and
   * starts watching it. `onCreated` runs once it is current, before the analytics events, so a caller can record its
   * own (the wizard's step events). Returns whether it was created; on failure `error` says why.
   */
  async create(draft: TournamentState, moderator: ModeratorProfile, onCreated?: () => void): Promise<boolean> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      try {
        if (!(await this.auth.currentUser())) await this.auth.signInAnonymously();
      } catch (error) {
        this.failure.set(moderatorAuthError(error));
        return false;
      }
      const snapshot = await this.repository.createSharedTournament(
        { ...draft, hostingMode: 'shared', players: [], rounds: [], groups: [], fixedPairs: [], finals: null },
        moderator.name.trim(),
        moderator.gender || 'male',
        moderator.avatar || undefined,
      );
      this.local.removeItem(SHARED_SETUP_KEY);
      this.session.removeItem(SHARED_SETUP_KEY);
      this.isModerator.set(true);
      this.token.set(snapshot.inviteToken ?? '');
      if (snapshot.inviteToken) this.saveInvite(snapshot.id, snapshot.inviteToken);
      this.apply(snapshot);
      this.watch(snapshot.id);
      this.message.set('created');
      onCreated?.();
      const state = this.tournament.state();
      const common = {
        tournament_mode: state.tournamentMode,
        doubles_format: state.doublesFormat ?? 'open',
        tournament_size: state.size,
      };
      this.analytics.capture('tournament_created', { hosting_mode: 'shared', ...common });
      this.analytics.capture('shared_tournament_created', { ...common, moderator_auth_mode: 'anonymous' });
      return true;
    } catch (error) {
      this.failure.set(sharedError(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Reads the moderator's own tournament again (after a reload) and watches it. `keepLocal` is true when this
   * device has changes still to be sent: the local copy stays current and only the server's snapshot is kept.
   * Returns the snapshot, or null when it could not be read.
   */
  async restore(id: string, keepLocal: boolean): Promise<SharedTournamentSnapshot | null> {
    try {
      const snapshot = await this.repository.getOwnedSharedTournament(id);
      this.isModerator.set(true);
      this.token.set(this.loadInvite(snapshot.id));
      if (keepLocal) this.replaceSnapshot(snapshot);
      else this.apply(snapshot);
      this.watch(snapshot.id);
      return snapshot;
    } catch (error) {
      this.failure.set(sharedError(error));
      return null;
    }
  }

  /** Reads the tournament again, for a realtime signal or the poll. A started tournament is left alone. */
  async refresh(id: string): Promise<void> {
    try {
      const snapshot = await this.repository.getOwnedSharedTournament(id);
      if (JSON.stringify([snapshot.status, snapshot.state]) === this.signature) return;
      if (this.tournament.state().rounds.length) return;
      this.apply(snapshot, true);
    } catch (error) {
      this.failure.set(sharedError(error));
    }
  }

  async addParticipant(participant: ModeratorProfile): Promise<boolean> {
    const id = this.tournament.state().sharedTournamentId;
    if (!id) return false;
    return this.run(async () => {
      this.apply(
        await this.repository.addSharedParticipant(
          id,
          participant.name.trim(),
          participant.gender || 'male',
          participant.avatar || undefined,
        ),
        true,
      );
      const state = this.tournament.state();
      this.analytics.capture('shared_participant_added_manually', {
        tournament_mode: state.tournamentMode,
        doubles_format: state.doublesFormat ?? 'open',
        tournament_size: state.size,
        participant_count: state.players.length,
      });
    });
  }

  async removeParticipant(playerId: string): Promise<boolean> {
    const id = this.tournament.state().sharedTournamentId;
    if (!id) return false;
    return this.run(async () => {
      this.apply(await this.repository.removeSharedParticipant(id, playerId), true);
    });
  }

  /** A new invite link; the previous one stops working. */
  async renewInvite(): Promise<boolean> {
    const id = this.tournament.state().sharedTournamentId;
    if (!this.isModerator() || !id) return false;
    return this.run(async () => {
      const invite = await this.repository.rotateSharedInvite(id);
      this.token.set(invite.inviteToken);
      this.saveInvite(id, invite.inviteToken);
      const current = this.latest();
      if (current) this.latest.set({ ...current, inviteExpiresAt: invite.inviteExpiresAt });
      this.message.set('renewed');
    });
  }

  async copyInvite(): Promise<void> {
    const url = this.inviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.message.set('copied');
      const state = this.tournament.state();
      this.analytics.capture('shared_invite_copied', {
        tournament_mode: state.tournamentMode,
        doubles_format: state.doublesFormat ?? 'open',
        tournament_size: state.size,
      });
    } catch {
      this.failure.set({ key: 'copyFailed' });
    }
  }

  /** Archives the tournament on the server. The shell then clears the device. */
  async cancel(id: string): Promise<boolean> {
    return this.run(() => this.repository.cancelSharedTournament(id));
  }

  /** Stops watching (the app is closing); the tournament stays owned. */
  stopWatching(): void {
    this.stopWatch?.();
    this.stopWatch = null;
  }

  /** Stops owning the tournament: no more watching, no moderator, no invite. */
  leave(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    const id = this.tournament.state().sharedTournamentId;
    if (id) this.feed.stopSharedWatch(id);
    this.isModerator.set(false);
    this.latest.set(null);
    this.token.set('');
    this.signature = '';
    this.clearMessages();
    try {
      if (id) this.local.removeItem(`${OWNER_INVITE_KEY}.${id}`);
    } catch {
      /* sem armazenamento local */
    }
  }

  /** Watches the tournament (guests joining) until it starts or the moderator leaves it. */
  private watch(id: string): void {
    this.stopWatch?.();
    this.stopWatch = this.feed.watchShared(id, () => void this.refresh(id));
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await action();
      return true;
    } catch (error) {
      this.failure.set(sharedError(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private saveInvite(id: string, token: string): void {
    try {
      this.local.setItem(`${OWNER_INVITE_KEY}.${id}`, token);
    } catch {
      /* sem armazenamento local */
    }
  }

  private loadInvite(id: string): string {
    try {
      return this.local.getItem(`${OWNER_INVITE_KEY}.${id}`) ?? '';
    } catch {
      return '';
    }
  }
}
