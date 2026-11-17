import { inject, Injectable } from '@angular/core';
import { TournamentArchive } from '../core/archive/tournament-archive';
import { CurrentTournament } from '../core/current-tournament';
import { Notices } from '../core/notices';
import { OwnedSharedTournament, SHARED_SETUP_KEY } from '../core/owned-shared-tournament';
import { APP_CONFIG } from '../core/ports/app-config.port';
import { AUTH } from '../core/ports/auth.port';
import { CLOCK } from '../core/ports/clock.port';
import { CONNECTIVITY } from '../core/ports/connectivity.port';
import { LOCAL_STORE, SESSION_STORE } from '../core/ports/key-value-store.port';
import { AppNavigation } from '../core/routing/app-navigation';
import { SavedTournaments } from '../core/saved-tournaments';
import { SetupProgress } from '../core/setup-progress';
import { ShellContext } from '../core/shell-context';
import { StorageService } from '../core/storage.service';
import { libraryId } from '../core/tournament-library';
import { TournamentPersistence } from '../core/tournament-persistence';
import { TournamentSync } from '../core/sync/tournament-sync';
import { newTournament, normalizeStoredTournament } from '../domain/tournament-setup/setup-rules';

/**
 * What the shell does at start, apart from showing things: load the tournament the device holds (and what was still
 * waiting to be sent), start the sync and the archive, restore the moderator's own shared tournament, and move the
 * page when a shared tournament is applied. A shared view (someone else's tournament) starts none of it.
 */
@Injectable({ providedIn: 'root' })
export class ShellStartup {
  private readonly tournament = inject(CurrentTournament);
  private readonly context = inject(ShellContext);
  private readonly navigation = inject(AppNavigation);
  private readonly sync = inject(TournamentSync);
  private readonly archive = inject(TournamentArchive);
  private readonly saved = inject(SavedTournaments);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly setup = inject(SetupProgress);
  private readonly notices = inject(Notices);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AUTH);
  private readonly config = inject(APP_CONFIG);
  private readonly clock = inject(CLOCK);
  private readonly connectivity = inject(CONNECTIVITY);
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);
  private stopConnectivity: (() => void) | null = null;

  constructor() {
    // The services that react to what the shell does must exist before it does it.
    inject(TournamentPersistence);
    this.owned.applied$.subscribe(({ keepView }) => {
      if (!keepView) this.navigation.setPage(this.tournament.state().rounds.length ? 'overview' : 'setup', 'system');
    });
  }

  /** Loads the tournament the device holds into `CurrentTournament` and picks the first page. */
  restore(): void {
    if (this.context.isSharedView) {
      // Only a placeholder: the shared view reads its own tournament. Its hosting mode is what analytics reports.
      this.tournament.set({ ...newTournament(this.clock.iso()), hostingMode: this.context.viewerHostingMode });
      this.navigation.initialize('shared');
      return;
    }
    const dashboard = this.navigation.dashboardRoute();
    this.tournament.set(this.storage.loadTournament() ?? newTournament(this.clock.iso()));
    this.sync.restore();
    if (!dashboard) this.archive.keep(this.tournament.state());
    let versionResetKept = false;
    if (
      !this.sync.pendingNow() &&
      this.storage.clearCompletedTournamentOnVersionChange(this.config.buildId, this.tournament.state())
    ) {
      const id = libraryId(this.tournament.state());
      versionResetKept = !!id && !!this.saved.library.get(id);
      this.tournament.set(newTournament(this.clock.iso()));
    }
    this.tournament.update(normalizeStoredTournament);
    this.sync.restoreLiveLink();
    this.navigation.initialize(dashboard ? 'dashboard' : this.tournament.state().rounds.length ? 'overview' : 'setup');
    this.saved.refresh();
    if (versionResetKept) this.notices.showKey('versionReset');
  }

  /** Starts the background work of a session that owns its tournament. `locked` waits for the unlock screen. */
  start(locked: boolean): void {
    if (this.context.isSharedView) return;
    this.stopConnectivity = this.connectivity.onChange((online) => {
      if (!online) return;
      void this.sync.run();
      void this.archive.flush();
    });
    if (!locked && !this.navigation.dashboardRoute()) this.afterUnlock();
    this.sync.start();
    void this.restoreOwnerSharedFlow();
    if (!this.navigation.dashboardRoute()) void this.sync.run();
  }

  /** The device is usable (no lock screen): report and archive what it already holds. */
  afterUnlock(): void {
    this.archive.backfillMetrics();
    this.archive.archiveCurrent();
  }

  stop(): void {
    this.stopConnectivity?.();
    this.stopConnectivity = null;
    this.sync.stop();
    this.owned.stopWatching();
  }

  /** The moderator's own shared tournament: read it again from the server and keep watching it. */
  private async restoreOwnerSharedFlow(): Promise<void> {
    if (!this.auth.configured) return;
    this.local.removeItem(SHARED_SETUP_KEY);
    this.session.removeItem(SHARED_SETUP_KEY);
    const state = this.tournament.state();
    if (state.hostingMode === 'shared' && state.sharedTournamentId && (await this.auth.currentUser())) {
      const keepLocal = this.sync.hasPendingFor('shared', state.sharedTournamentId);
      const snapshot = await this.owned.restore(state.sharedTournamentId, keepLocal);
      if (!snapshot) return;
      if (!snapshot.state.rounds?.length) {
        this.navigation.setPage('setup', 'system');
        this.setup.show(2);
      }
      void this.sync.run();
    }
  }
}
