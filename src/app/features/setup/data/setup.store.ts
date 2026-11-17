import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { CurrentTournament } from '../../../core/current-tournament';
import { TournamentPersistence } from '../../../core/tournament-persistence';
import { Notices } from '../../../core/notices';
import { LocalProfileStore } from '../../../core/local-profile.store';
import type { Player, PlayerGender } from '../../../core/models';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { profileAutoJoin } from '../../../core/profile';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { RANDOM } from '../../../core/ports/random.port';
import { SavedTournaments } from '../../../core/saved-tournaments';
import { SetupProgress, type SetupStepNumber } from '../../../core/setup-progress';
import type { BatchDraft } from '../../../domain/tournament-setup/batch';
import {
  addPlayer,
  addPlayers,
  type NewPlayer,
  type PlayerError,
  removePlayer,
  setPlayerGender,
  swapFixedPair,
} from '../../../domain/tournament-setup/players';
import {
  availableCourts,
  availableGamesToWin,
  availableSizes,
  enrollment,
  hasSchedule,
  requiredRounds,
  reviewKind,
  withCourts,
  withDoublesFormat,
  withEarlyFinals,
  withGamesToWin,
  withGroupFormat,
  withHostingMode,
  withMixedFinalFormat,
  withName,
  withQualificationStats,
  withRequiredRounds,
  withSize,
  withTournamentMode,
  withTrimmedName,
} from '../../../domain/tournament-setup/setup-rules';
import {
  fixedPairsMode,
  isEarlyFinalsOptionAvailable,
  isGroupTournament,
  isMixedDoubles,
} from '../../../domain/tournament-view/format';
import { tourKey, TUTORIAL_KEY } from './setup-tour-steps';

const EMPTY_PLAYER: NewPlayer = { name: '', gender: '', avatar: '' };

/**
 * The setup wizard's state and actions. Provided by `SetupComponent`, so it lives and dies with the page; what must
 * outlive the page is in root services: the tournament (`CurrentTournament`), the step (`SetupProgress`) and the
 * moderator's shared tournament (`OwnedSharedTournament`). The store only replaces the tournament, never edits it,
 * and saves through `TournamentPersistence.save`. Persistence follows the old wizard: the format choices
 * are kept in memory until "next", the roster and the toggles are saved as they change.
 */
@Injectable()
export class SetupStore {
  private readonly tournament = inject(CurrentTournament);
  private readonly persistence = inject(TournamentPersistence);
  private readonly notices = inject(Notices);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly progress = inject(SetupProgress);
  private readonly profile = inject(LocalProfileStore);
  private readonly analytics = inject(ANALYTICS);
  private readonly random = inject(RANDOM);
  private readonly local = inject(LOCAL_STORE);
  private readonly transloco = inject(TranslocoService);
  private readonly savedTournaments = inject(SavedTournaments);

  readonly state = this.tournament.state;
  readonly step = this.progress.step;
  readonly savedCount = computed(() => this.savedTournaments.entries().length);

  readonly isShared = computed(() => this.state().hostingMode === 'shared');
  readonly isGroup = computed(() => isGroupTournament(this.state()));
  readonly isMixed = computed(() => isMixedDoubles(this.state()));
  readonly fixedPairs = computed(() => fixedPairsMode(this.state()));
  readonly hasSchedule = computed(() => hasSchedule(this.state()));
  readonly earlyFinalsAvailable = computed(() => isEarlyFinalsOptionAvailable(this.state()));
  readonly sizes = computed(() => availableSizes(this.state()));
  readonly courts = computed(() => availableCourts(this.state()));
  readonly gamesToWin = computed(() => availableGamesToWin(this.state()));
  readonly rounds = computed(() => requiredRounds(this.state()));
  readonly enrollment = computed(() => enrollment(this.state()));
  readonly review = computed(() => reviewKind(this.state()));
  readonly full = computed(() => this.state().players.length >= this.state().size);
  readonly complete = computed(() => this.state().players.length === this.state().size);
  readonly sharedConfigured = this.owned.configured;

  /** Does the moderator of this shared tournament still take participants (registration open)? */
  readonly canManageParticipants = computed(
    () =>
      this.isShared() &&
      this.owned.moderator() &&
      (this.state().sharedStatus === 'registration' || this.state().sharedStatus === 'ready'),
  );
  readonly isModerator = this.owned.moderator;
  readonly snapshot = this.owned.snapshot;
  readonly inviteUrl = this.owned.inviteUrl;
  readonly sharedLoading = this.owned.loading;
  readonly sharedError = this.owned.error;
  readonly sharedNotice = this.owned.notice;
  readonly canStart = computed(
    () => !this.isShared() || (this.owned.moderator() && this.state().sharedStatus === 'ready'),
  );

  private readonly newPlayerDraft = signal<NewPlayer>({ ...EMPTY_PLAYER });
  private readonly manualDraft = signal<NewPlayer>({ ...EMPTY_PLAYER });
  private readonly moderatorDraft = signal<NewPlayer>({ ...EMPTY_PLAYER });
  private readonly playerFailure = signal<PlayerError | null>(null);
  private readonly tutorial = signal(this.readTutorialEnabled());

  readonly newPlayer = this.newPlayerDraft.asReadonly();
  readonly manualParticipant = this.manualDraft.asReadonly();
  readonly moderator = this.moderatorDraft.asReadonly();
  readonly playerError = this.playerFailure.asReadonly();
  readonly tutorialEnabled = this.tutorial.asReadonly();

  constructor() {
    // A saved profile fills the moderator fields of the setup (it never overrides what was typed).
    effect(() => {
      const { name, gender, photoDataUrl } = this.profile.profile();
      untracked(() =>
        this.moderatorDraft.update((draft) => ({
          name: draft.name.trim() ? draft.name : name,
          gender: draft.gender || gender || '',
          avatar: draft.avatar || photoDataUrl || '',
        })),
      );
    });
  }

  // ---- Step 1: the format --------------------------------------------------------------------------------------

  setName(name: string): void {
    this.tournament.update((state) => withName(state, name));
  }

  setHostingMode(mode: 'local' | 'shared'): void {
    if (this.hasSchedule() || (mode === 'shared' && !this.owned.configured)) return;
    this.tournament.update((state) => withHostingMode(state, mode));
    this.owned.clearMessages();
    this.persistence.save();
  }

  setQualificationStats(enabled: boolean): void {
    if (this.hasSchedule()) return;
    this.tournament.update((state) => withQualificationStats(state, enabled));
    this.persistence.save();
  }

  setDoublesFormat(format: 'open' | 'mixed'): void {
    if (this.hasSchedule()) return;
    this.tournament.update((state) => withDoublesFormat(state, format));
    this.persistence.save();
  }

  setTournamentMode(mode: 'super' | 'groups'): void {
    this.tournament.update((state) => withTournamentMode(state, mode));
  }

  setGroupFormat(format: 'rotating' | 'fixed'): void {
    this.tournament.update((state) => withGroupFormat(state, format));
  }

  setSize(size: number): void {
    this.tournament.update((state) => withSize(state, size));
  }

  setCourts(courts: number): void {
    this.tournament.update((state) => withCourts(state, courts));
  }

  setGamesToWin(games: number): void {
    this.tournament.update((state) => withGamesToWin(state, games));
  }

  setEarlyFinals(enabled: boolean): void {
    if (this.hasSchedule() || !this.earlyFinalsAvailable()) return;
    this.tournament.update((state) => withEarlyFinals(state, enabled));
    this.persistence.save();
  }

  setMixedFinalFormat(format: 'knockout' | 'direct'): void {
    if (this.hasSchedule() || !this.earlyFinalsAvailable()) return;
    this.tournament.update((state) => withMixedFinalFormat(state, format));
    this.persistence.save();
  }

  setModerator(patch: Partial<NewPlayer>): void {
    this.moderatorDraft.update((draft) => ({ ...draft, ...patch }));
  }

  // ---- Moving between steps ------------------------------------------------------------------------------------

  /** Completed steps can be revisited, except in shared mode (the server tournament already exists). */
  canGoTo(step: SetupStepNumber): boolean {
    return step < this.step() && !this.isShared() && !this.hasSchedule();
  }

  goTo(step: SetupStepNumber): void {
    if (!this.canGoTo(step)) return;
    this.progress.revisit(step);
    this.notices.clear();
  }

  previous(): void {
    const step = this.step();
    if (step > 1) this.progress.set((step - 1) as SetupStepNumber);
    this.notices.clear();
  }

  /** Leaves the current step. Returns true when the step changed (the page may then offer the tour). */
  async next(): Promise<boolean> {
    if (this.step() === 1) {
      if (this.isShared()) {
        await this.createShared();
        return false;
      }
      this.tournament.update((state) => withRequiredRounds(withTrimmedName(state)));
      this.autoJoinProfile();
      this.persistence.save();
      this.progress.completed(1);
      this.progress.show(2);
      return true;
    }
    if (!this.complete()) {
      this.notices.show(
        this.transloco.translate('notices.exactPlayers', { size: this.state().size }, 'setup/pt-BR'),
        'error',
      );
      return false;
    }
    this.progress.completed(2);
    this.progress.show(3);
    this.notices.clear();
    return true;
  }

  // ---- Step 2: the players -------------------------------------------------------------------------------------

  setNewPlayer(patch: Partial<NewPlayer>): void {
    this.newPlayerDraft.update((draft) => ({ ...draft, ...patch }));
    if ('name' in patch) this.playerFailure.set(null);
  }

  /** Adds the athlete typed in the form. Returns true when added (the form is then cleared). */
  addPlayer(): boolean {
    const result = addPlayer(this.state(), this.newPlayerDraft(), this.random.uuid());
    if ('error' in result) {
      if (result.error !== 'empty') this.playerFailure.set(result.error);
      return false;
    }
    this.tournament.set(result.state);
    this.newPlayerDraft.set({ ...EMPTY_PLAYER });
    this.playerFailure.set(null);
    this.persistence.save();
    const state = this.state();
    this.analytics.capture('player_added', {
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      tournament_size: state.size,
      participant_count: state.players.length,
    });
    return true;
  }

  /** Adds the athletes of the batch dialog. */
  addBatch(drafts: readonly BatchDraft[]): void {
    const ids = drafts.map(() => this.random.uuid());
    this.tournament.update((state) => addPlayers(state, drafts, ids));
    this.persistence.save(this.transloco.translate('notices.batchAdded', {}, 'setup/pt-BR'));
  }

  removePlayer(id: string): void {
    const result = removePlayer(this.state(), id);
    if ('error' in result) {
      if (result.error === 'shared')
        this.notices.show(this.transloco.translate('notices.sharedNoRemove', {}, 'setup/pt-BR'), 'error');
      return;
    }
    this.tournament.set(result.state);
    this.persistence.save();
  }

  setPlayerGender(playerId: string, gender: PlayerGender | ''): void {
    const next = setPlayerGender(this.state(), playerId, gender);
    if (next === this.state()) return;
    this.tournament.set(next);
    this.persistence.save();
  }

  /** The athletes that can fill a seat of pair `pairIndex` in the fixed-pairs list. */
  fixedPairOptions(pairIndex: number): readonly Player[] {
    return this.state().fixedPairs?.[pairIndex] ? this.state().players : [];
  }

  swapFixedPair(pairIndex: number, side: 0 | 1, playerId: string): void {
    const result = swapFixedPair(this.state(), pairIndex, side, playerId);
    if ('error' in result) {
      this.notices.show(this.transloco.translate('notices.mixedPair', {}, 'setup/pt-BR'), 'error');
      return;
    }
    if (result.state === this.state()) return;
    this.tournament.set(result.state);
    this.persistence.save();
  }

  // ---- Step 2: the shared tournament ---------------------------------------------------------------------------

  setManualParticipant(patch: Partial<NewPlayer>): void {
    this.manualDraft.update((draft) => ({ ...draft, ...patch }));
  }

  async addManualParticipant(): Promise<void> {
    const draft = this.manualDraft();
    if (!draft.name.trim() || !this.canManageParticipants() || !this.state().sharedTournamentId) return;
    if (this.isMixed() && !draft.gender) {
      this.owned.fail({ key: 'categoryRequired' });
      return;
    }
    if (await this.owned.addParticipant(draft)) this.manualDraft.set({ ...EMPTY_PLAYER });
  }

  async removeManualParticipant(playerId: string): Promise<void> {
    if (!this.canManageParticipants() || !this.state().sharedTournamentId) return;
    await this.owned.removeParticipant(playerId);
  }

  copyInvite(): Promise<void> {
    return this.owned.copyInvite();
  }

  async renewInvite(): Promise<void> {
    await this.owned.renewInvite();
  }

  private async createShared(): Promise<boolean> {
    const state = this.state();
    const moderator = this.moderatorDraft();
    const reject = (key: 'sharedNotConfigured' | 'moderatorName' | 'moderatorCategory' | 'shareFresh'): false => {
      this.notices.show(this.rejection(key), 'error');
      return false;
    };
    if (!this.owned.configured) return reject('sharedNotConfigured');
    if (!moderator.name.trim()) return reject('moderatorName');
    if (this.isMixed() && !moderator.gender) return reject('moderatorCategory');
    if (state.players.length || state.rounds.length) return reject('shareFresh');
    this.tournament.update((current) => ({ ...withRequiredRounds(withTrimmedName(current)), hostingMode: 'shared' }));
    const created = await this.owned.create(this.state(), moderator, () => {
      this.progress.completed(1);
      this.progress.show(2);
    });
    if (created) this.persistence.save();
    return created;
  }

  private rejection(key: 'sharedNotConfigured' | 'moderatorName' | 'moderatorCategory' | 'shareFresh'): string {
    switch (key) {
      case 'sharedNotConfigured':
        return this.transloco.translate('notices.sharedNotConfigured', {}, 'setup/pt-BR');
      case 'moderatorName':
        return this.transloco.translate('notices.moderatorName', {}, 'setup/pt-BR');
      case 'moderatorCategory':
        return this.transloco.translate('notices.moderatorCategory', {}, 'setup/pt-BR');
      case 'shareFresh':
        return this.transloco.translate('notices.shareFresh', {}, 'setup/pt-BR');
    }
  }

  // ---- The tour ------------------------------------------------------------------------------------------------

  private readTutorialEnabled(): boolean {
    try {
      return this.local.getItem(TUTORIAL_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  /** Should the tour start by itself on this step: it is on, and this step's tour was not finished before. */
  shouldAutoStartTour(step: SetupStepNumber): boolean {
    try {
      return this.local.getItem(TUTORIAL_KEY) !== 'off' && !this.local.getItem(tourKey(step));
    } catch {
      return false;
    }
  }

  tourStarted(step: SetupStepNumber): void {
    this.analytics.capture('tutorial_started', { step });
  }

  tourFinished(step: SetupStepNumber): void {
    this.remember(tourKey(step), 'done');
    this.analytics.capture('tutorial_finished', { step });
  }

  /** "Desligar dicas" from the tour popover. */
  tourSwitchedOff(step: SetupStepNumber): void {
    this.tutorial.set(false);
    this.remember(TUTORIAL_KEY, 'off');
    this.analytics.capture('tutorial_disabled', { step });
  }

  toggleTutorial(): void {
    const enabled = !this.tutorial();
    this.tutorial.set(enabled);
    try {
      if (enabled) ([1, 2, 3] as const).forEach((step) => this.local.removeItem(tourKey(step)));
      else this.local.setItem(TUTORIAL_KEY, 'off');
    } catch {
      /* sem persistência */
    }
    this.analytics.capture(enabled ? 'tutorial_enabled' : 'tutorial_disabled');
  }

  private remember(key: string, value: string): void {
    try {
      this.local.setItem(key, value);
    } catch {
      /* sem persistência */
    }
  }

  // ---- Auto-join -----------------------------------------------------------------------------------------------

  /** Adds the device owner as a player of a fresh local tournament, unless they chose to only manage. */
  private autoJoinProfile(): void {
    const state = this.state();
    if (this.isShared() || this.hasSchedule() || state.players.length) return;
    const result = profileAutoJoin(this.profile.profile(), state.players, state.size, this.isMixed());
    if ('player' in result) {
      const { name, gender, photoDataUrl } = result.player;
      const added = addPlayer(state, { name, gender: gender ?? '', avatar: photoDataUrl ?? '' }, this.random.uuid());
      if ('state' in added) this.tournament.set(added.state);
      this.analytics.capture('profile_auto_joined', {
        tournament_mode: state.tournamentMode,
        doubles_format: state.doublesFormat ?? 'open',
      });
    } else if (result.skipped === 'needs-gender') {
      this.notices.show(this.transloco.translate('notices.autoJoinNeedsGender', {}, 'setup/pt-BR'));
    }
  }
}
