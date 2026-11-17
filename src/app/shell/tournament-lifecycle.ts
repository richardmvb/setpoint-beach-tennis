import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { TournamentArchive } from '../core/archive/tournament-archive';
import { CurrentTournament } from '../core/current-tournament';
import { DialogService } from '../core/dialog.service';
import { GroupScheduleService } from '../core/group-schedule.service';
import { LocalLiveLink } from '../core/local-live-link';
import type { TournamentState } from '../core/models';
import { libraryId } from '../core/tournament-library';
import { Notices } from '../core/notices';
import { OwnedSharedTournament } from '../core/owned-shared-tournament';
import { ANALYTICS } from '../core/ports/analytics.port';
import { CLOCK } from '../core/ports/clock.port';
import { RANDOM } from '../core/ports/random.port';
import { SHARED_TOURNAMENTS } from '../core/ports/tournaments.port';
import { AppNavigation } from '../core/routing/app-navigation';
import { SavedTournaments } from '../core/saved-tournaments';
import { ScheduleService } from '../core/schedule.service';
import { SelectedRound } from '../core/selected-round';
import { SetupProgress } from '../core/setup-progress';
import { StorageService } from '../core/storage.service';
import { TournamentPersistence } from '../core/tournament-persistence';
import { TournamentSync } from '../core/sync/tournament-sync';
import { newTournament, requiredRounds } from '../domain/tournament-setup/setup-rules';
import * as tournamentFormat from '../domain/tournament-view/format';
import { ShareResultsSession } from '../features/tournament/share-results-dialog/share-results-session';

const MAX_BACKUP_BYTES = 1_000_000;

/**
 * What changes which tournament the device holds: starting it (the schedule), throwing it away (reset), archiving a
 * shared one, loading a backup or a saved tournament. The shell asks; each flow does its checks (a sync still running,
 * changes not yet sent), asks the person to confirm where it destroys something, replaces the tournament and says what
 * happened. A flow that should end on the landing page says so in what it returns; the shell shows it.
 */
@Injectable({ providedIn: 'root' })
export class TournamentLifecycle {
  private readonly tournament = inject(CurrentTournament);
  private readonly persistence = inject(TournamentPersistence);
  private readonly sync = inject(TournamentSync);
  private readonly archive = inject(TournamentArchive);
  private readonly notices = inject(Notices);
  private readonly navigation = inject(AppNavigation);
  private readonly saved = inject(SavedTournaments);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly liveLink = inject(LocalLiveLink);
  private readonly dialog = inject(DialogService);
  private readonly shareSession = inject(ShareResultsSession);
  private readonly selectedRound = inject(SelectedRound);
  private readonly setup = inject(SetupProgress);
  private readonly storage = inject(StorageService);
  private readonly scheduler = inject(ScheduleService);
  private readonly groupScheduler = inject(GroupScheduleService);
  private readonly sharedTournaments = inject(SHARED_TOURNAMENTS);
  private readonly analytics = inject(ANALYTICS);
  private readonly random = inject(RANDOM);
  private readonly clock = inject(CLOCK);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    // The schedule services default to Math.random; production draws go through the Random port instead.
    this.scheduler.random = () => this.random.next();
    this.groupScheduler.random = () => this.random.next();
  }

  /** Draws the rounds (and starts the shared tournament on the server when it is one), then saves and shows them. */
  async generateSchedule(): Promise<void> {
    const previous = this.tournament.state();
    if (previous.players.length !== previous.size) {
      return this.notices.showKey('scheduleCount', 'error', { size: previous.size, count: previous.players.length });
    }
    if (previous.rounds.length) return this.notices.showKey('scheduleExists');
    const shared = previous.hostingMode === 'shared';
    if (shared && (!this.owned.moderator() || previous.sharedStatus !== 'ready')) {
      return this.notices.showKey('sharedStartModerator', 'error');
    }
    try {
      const courts = previous.courts;
      const roundCount = requiredRounds(previous);
      const mixed = tournamentFormat.isMixedDoubles(previous);
      const base = { ...previous, roundCount, courts };
      // A new object, so a feature showing the tournament (the setup review) sees the schedule appear.
      if (tournamentFormat.isGroupTournament(previous)) {
        const schedule = this.groupScheduler.generate(
          previous.players,
          previous.groupFormat ?? 'rotating',
          previous.fixedPairs ?? [],
          mixed,
        );
        this.tournament.set({ ...base, groups: schedule.groups, rounds: schedule.rounds });
      } else {
        this.tournament.set({
          ...base,
          groups: [],
          rounds: this.scheduler.generate(previous.players, previous.size, courts, roundCount, mixed),
        });
      }
      const sharedId = this.tournament.state().sharedTournamentId;
      if (shared && sharedId) {
        this.tournament.update((state) => ({ ...state, startedAt: this.clock.iso() }));
        this.owned.apply(await this.sharedTournaments.startSharedTournament(sharedId, this.tournament.state()));
      }
      this.tournament.update((state) => ({
        ...state,
        startedAt: state.startedAt ?? this.clock.iso(),
        analyticsId: shared ? state.analyticsId : (state.analyticsId ?? this.random.uuid()),
      }));
      this.selectedRound.reset();
      this.persistence.save(this.transloco.translate('shell.notice.scheduleSaved'));
      this.navigation.setPage('rounds');
      if (!shared) this.archive.recordMetrics();
      this.setup.completed(3);
      this.captureStarted(shared);
    } catch (error) {
      if (shared) {
        // The server did not start it: the tournament goes back to what it was (no schedule, not started).
        this.tournament.update((state) => ({
          ...state,
          rounds: previous.rounds,
          groups: previous.groups,
          startedAt: previous.startedAt,
        }));
      }
      if (error instanceof Error) this.notices.show(error.message, 'error');
      else this.notices.showKey('scheduleFailed', 'error');
    }
  }

  private captureStarted(shared: boolean): void {
    const state = this.tournament.state();
    const common = {
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      hosting_mode: state.hostingMode,
      tournament_size: state.size,
    };
    if (!shared) {
      this.analytics.capture('tournament_created', {
        hosting_mode: common.hosting_mode,
        tournament_mode: common.tournament_mode,
        doubles_format: common.doubles_format,
        tournament_size: common.tournament_size,
      });
    }
    this.analytics.capture('tournament_started', { ...common, round_count: state.rounds.length });
    const scheduled = { ...common, round_count: state.rounds.length, court_count: state.courts };
    this.analytics.capture('schedule_generated', scheduled);
    this.analytics.logInfo('tournament schedule generated', scheduled);
  }

  /** Throws the tournament away and starts a new one. True when the shell should show the landing page. */
  async reset(): Promise<boolean> {
    const state = this.tournament.state();
    if (this.owned.moderator() && state.sharedTournamentId) return this.cancelShared(true);
    if (this.sync.inFlight()) {
      this.notices.showKey('syncWaitNew', 'error');
      return false;
    }
    if (!(await this.confirmDiscardPendingSync())) return false;
    const kept = this.isSavedInLibrary();
    const confirmed = await this.dialog.confirm(
      kept
        ? {
            title: this.transloco.translate('shell.confirm.newKept.title'),
            text: this.transloco.translate('shell.confirm.newKept.text'),
            confirmText: this.transloco.translate('shell.confirm.newKept.confirm'),
          }
        : {
            title: this.transloco.translate('shell.confirm.newErase.title'),
            text: this.transloco.translate('shell.confirm.newErase.text'),
            confirmText: this.transloco.translate('shell.confirm.newErase.confirm'),
            tone: 'danger',
          },
    );
    if (!confirmed) return false;
    if (state.hostingMode !== 'shared') this.archive.recordMetrics(true);
    this.clearLocalTournament();
    return true;
  }

  /** Archives the moderator's shared tournament on the server and starts over. True when it was done. */
  async cancelShared(returnToLanding = false): Promise<boolean> {
    const id = this.tournament.state().sharedTournamentId;
    if (!this.owned.moderator() || !id) return false;
    if (this.sync.inFlight()) {
      this.notices.showKey('syncWaitArchive', 'error');
      return false;
    }
    if (!(await this.confirmDiscardPendingSync())) return false;
    const confirmed = await this.dialog.confirm({
      title: this.transloco.translate('shell.confirm.archive.title'),
      text: this.transloco.translate('shell.confirm.archive.text'),
      confirmText: this.transloco.translate('shell.confirm.archive.confirm'),
      tone: 'danger',
    });
    if (!confirmed || !(await this.owned.cancel(id))) return false;
    this.clearLocalTournament();
    return returnToLanding;
  }

  private clearLocalTournament(): void {
    this.archive.keep(this.tournament.state());
    this.sync.removeCurrent();
    this.storage.clearTournament();
    this.owned.leave();
    this.liveLink.clear();
    this.sync.clearError();
    this.tournament.set(newTournament(this.clock.iso()));
    this.selectedRound.reset();
    this.setup.set(1);
    this.navigation.setPage('setup');
    this.saved.refresh();
    this.setup.viewed(1);
    this.notices.showKey('newTournament');
  }

  async importBackup(file: File): Promise<void> {
    if (file.size > MAX_BACKUP_BYTES) return this.notices.showKey('backupTooLarge', 'error');
    const imported = this.storage.parseTournament(await file.text());
    if (!imported) return this.notices.showKey('backupInvalid', 'error');
    if (!(await this.adopt(imported, 'backup'))) return;
    const state = this.tournament.state();
    this.analytics.capture('backup_imported', {
      tournament_mode: state.tournamentMode,
      tournament_size: state.size,
      has_schedule: state.rounds.length > 0,
      is_finalized: !!state.finishedAt,
    });
  }

  /** Opens a tournament of "Meus torneios". True when it is now the one in use, so the list can close. */
  async openSaved(id: string): Promise<boolean> {
    const entry = this.saved.library.get(id);
    const saved = this.saved.library.load(id);
    if (!entry || !saved) {
      this.notices.showKey('savedOpenFailed', 'error');
      return false;
    }
    const state = this.tournament.state();
    if (libraryId(state) === entry.id) {
      this.navigation.setPage(state.rounds.length ? 'overview' : 'setup');
      return true;
    }
    if (!(await this.adopt(saved, 'library', entry.hosting === 'shared'))) return false;
    window.scrollTo({ top: 0 });
    this.analytics.capture('tournament_library_opened_item', { phase: entry.phase, hosting_mode: entry.hosting });
    return true;
  }

  /** Replaces the tournament in the active slot with a backup file or a saved library entry. */
  private async adopt(imported: TournamentState, origin: 'backup' | 'library', fromShared = false): Promise<boolean> {
    if (this.sync.inFlight()) {
      this.notices.showKey('syncWaitSwitch', 'error');
      return false;
    }
    if (!(await this.confirmDiscardPendingSync())) return false;
    const current = this.tournament.state();
    const replacesWork =
      origin === 'backup'
        ? !!(current.players.length || current.rounds.length)
        : current.players.length > 0 && !this.isSavedInLibrary();
    if (replacesWork && !(await this.confirmReplace(origin))) return false;
    if (!this.sync.discardCurrentExcept(imported.analyticsId)) {
      this.notices.showKey('queueNotUpdated', 'error');
      return false;
    }
    this.sync.clearError();
    this.owned.leave();
    if (this.liveLink.analyticsId() && this.liveLink.analyticsId() !== imported.analyticsId) this.liveLink.clear();
    const { sharedTournamentId: _sharedId, sharedStatus: _sharedStatus, ...local } = imported;
    this.tournament.set({
      ...local,
      hostingMode: 'local',
      analyticsId: local.analyticsId ?? (local.rounds.length ? this.random.uuid() : undefined),
      groups: local.groups ?? [],
      fixedPairs: local.fixedPairs ?? [],
      finals: local.finals ?? null,
      tieBreakDraws: local.tieBreakDraws ?? [],
    });
    this.sync.restoreLiveLink();
    this.selectedRound.reset();
    this.shareSession.playerId.set('');
    this.shareSession.message.set('');
    // A local copy of a shared tournament is already stored on the server: do not archive or count it twice.
    this.persistence.save(undefined, !fromShared);
    if (fromShared) this.archive.keep(this.tournament.state(), true);
    this.saved.refresh();
    const state = this.tournament.state();
    this.navigation.setPage(state.finals?.complete ? 'ranking' : state.rounds.length ? 'overview' : 'setup');
    if (origin === 'backup' && state.startedAt) this.archive.recordMetrics();
    if (state.finals?.complete) this.notices.showKey('finishedLoaded');
    else this.notices.showKey(origin === 'backup' ? 'backupLoaded' : 'savedOpened');
    return true;
  }

  private confirmReplace(origin: 'backup' | 'library'): Promise<boolean> {
    return this.dialog.confirm(
      origin === 'backup'
        ? {
            title: this.transloco.translate('shell.confirm.importBackup.title'),
            text: this.transloco.translate('shell.confirm.importBackup.text'),
            confirmText: this.transloco.translate('shell.confirm.importBackup.confirm'),
            tone: 'danger',
          }
        : {
            title: this.transloco.translate('shell.confirm.openOther.title'),
            text: this.transloco.translate('shell.confirm.openOther.text'),
            confirmText: this.transloco.translate('shell.confirm.openOther.confirm'),
            tone: 'danger',
          },
    );
  }

  /** True when it is safe to go on: nothing pending, or the person chose to discard it. */
  private async confirmDiscardPendingSync(): Promise<boolean> {
    if (!this.sync.pendingNow()) return true;
    return this.dialog.confirm({
      title: this.transloco.translate('shell.confirm.discardPending.title'),
      text: this.transloco.translate('shell.confirm.discardPending.text'),
      confirmText: this.transloco.translate('shell.confirm.discardPending.confirm'),
      cancelText: this.transloco.translate('shell.confirm.discardPending.cancel'),
      tone: 'danger',
    });
  }

  private isSavedInLibrary(): boolean {
    try {
      const id = libraryId(this.tournament.state());
      return !!id && !!this.saved.library.get(id);
    } catch {
      return false;
    }
  }
}
