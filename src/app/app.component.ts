import {
  Component,
  computed,
  DoCheck,
  inject,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Page, ThemeMode, TournamentState } from './core/models';
import { StorageService } from './core/storage.service';
import { CurrentTournament } from './core/current-tournament';
import { Notices } from './core/notices';
import { SetupProgress } from './core/setup-progress';
import { LocalProfileStore } from './core/local-profile.store';
import { SavedTournaments } from './core/saved-tournaments';
import { TournamentArchive } from './core/archive/tournament-archive';
import { SyncErrorText } from './core/sync/sync-error-text';
import { TournamentSync } from './core/sync/tournament-sync';
import { AppNavigation } from './core/routing/app-navigation';
import { ShellContext } from './core/shell-context';
import type {
  ProfileDialogData,
  ProfileDialogResult,
  ProfileShellState,
} from './features/profile/data/profile-panel.store';
import type { ProfileDialogComponent } from './features/profile/profile-dialog.component';
import type { LibraryDialogData } from './features/library/data/library.store';
import type { LibraryDialogComponent } from './features/library/library-dialog.component';
import { libraryId } from './core/tournament-library';
import { SYNC_STATUS_LABEL } from './core/state-machines';
import { SetupTourCue } from './features/setup/data/setup-tour-cue';
import { PlayerAvatarComponent } from './features/player-avatar.component';
import { ANALYTICS } from './core/ports/analytics.port';
import { AppUser, AUTH } from './core/ports/auth.port';
import { APP_CONFIG, versionLabel } from './core/ports/app-config.port';
import { LOCAL_STORE, SESSION_STORE } from './core/ports/key-value-store.port';
import { URL_STATE } from './core/routing/url-state';
import { DialogService } from './core/dialog.service';
import { NpsFeedbackService } from './core/nps-feedback.service';
import * as tournamentFormat from './domain/tournament-view/format';
import { ProjectionController } from './features/tournament/projection/projection-controller';
import { SharedViewComponent } from './features/shared-view/shared-view.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LandingComponent } from './features/landing/landing.component';
import { SetupComponent } from './features/setup/setup.component';
import { TournamentComponent } from './features/tournament/tournament.component';
import {
  NO_SHELL_STATE,
  type ShellRequest,
  type TournamentShellState,
} from './features/tournament/data/tournament.store';
import { landingSeen } from './features/landing/data/landing-visit';
import { provideHostProjection } from './shell/host-projection';
import { ShellStartup } from './shell/shell-startup';
import { TournamentLifecycle } from './shell/tournament-lifecycle';

const ACCESS_PASSWORD = 'bt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    PlayerAvatarComponent,
    SharedViewComponent,
    DashboardComponent,
    LandingComponent,
    SetupComponent,
    TournamentComponent,
    TranslocoPipe,
  ],
  providers: [provideHostProjection()],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, DoCheck, OnDestroy {
  private readonly storage = inject(StorageService);
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);
  private readonly config = inject(APP_CONFIG);
  private readonly urlState = inject(URL_STATE);
  private readonly auth = inject(AUTH);
  private readonly analytics = inject(ANALYTICS);
  private readonly dialog = inject(DialogService);
  private readonly tournament = inject(CurrentTournament);
  private readonly setup = inject(SetupProgress);
  private readonly transloco = inject(TranslocoService);
  private readonly setupTourCue = inject(SetupTourCue);
  private readonly archive = inject(TournamentArchive);
  private readonly lifecycle = inject(TournamentLifecycle);
  private readonly startup = inject(ShellStartup);
  private readonly context = inject(ShellContext);
  private readonly navigation = inject(AppNavigation);
  protected readonly sync = inject(TournamentSync);
  protected readonly syncErrors = inject(SyncErrorText);
  protected readonly notices = inject(Notices);
  protected readonly nps = inject(NpsFeedbackService);
  protected readonly projection = inject(ProjectionController);
  protected readonly savedTournaments = inject(SavedTournaments);
  protected readonly profileStore = inject(LocalProfileStore);
  private readonly authCallback: boolean;
  private stopPathWatch: (() => void) | null = null;
  private authStateUnsubscribe: (() => void) | null = null;
  private identifiedUserId: string | null = null;

  /** The profile dialog is open: setup tours and the saved-tournaments prompt wait for it to close. */
  profileOpen = false;
  /** The saved-tournaments dialog is open (or loading), so a second click does not stack another. */
  private libraryOpen = false;
  /**
   * What the shell knows that the tournament pages and the profile dialog show (sync, theme). Refreshed on every
   * check until the shell is OnPush (B5b); it only changes when a field does, so the views it feeds stay still.
   */
  protected readonly shellState = signal<TournamentShellState>(NO_SHELL_STATE, {
    equal: (a, b) =>
      a.syncAvailable === b.syncAvailable &&
      a.syncStatus === b.syncStatus &&
      a.hasPendingSync === b.hasPendingSync &&
      a.syncPaused === b.syncPaused &&
      a.syncing === b.syncing &&
      a.online === b.online &&
      a.syncError === b.syncError &&
      a.theme === b.theme,
  });
  private readonly profileShell = computed<ProfileShellState>(
    () => {
      const shell = this.shellState();
      return {
        sync: shell.syncStatus,
        syncWarning:
          shell.hasPendingSync || !!shell.syncError || (shell.syncAvailable && (!shell.online || shell.syncPaused)),
        syncError: shell.syncError,
        theme: shell.theme,
      };
    },
    {
      equal: (a, b) =>
        a.sync === b.sync && a.syncWarning === b.syncWarning && a.syncError === b.syncError && a.theme === b.theme,
    },
  );
  isLocked = false;
  showLanding = false;
  sitePassword = '';
  lockError = '';
  theme: ThemeMode = 'light';
  appBasePath = '';
  readonly versionLabel = versionLabel(this.config);
  /** The address opens someone else's tournament: the page is the lazy shared view and no owner startup runs. */
  readonly isSharedView = this.context.isSharedView;

  /** The tournament being run: the one `CurrentTournament` holds, so the features see it too. */
  get state(): TournamentState {
    return this.tournament.state();
  }
  get page(): Page {
    return this.navigation.page();
  }
  get isDashboardRoute(): boolean {
    return this.navigation.dashboardRoute();
  }
  get hasSchedule(): boolean {
    return this.state.rounds.length > 0;
  }
  get isGroupTournament(): boolean {
    return tournamentFormat.isGroupTournament(this.state);
  }
  get syncLabel(): string {
    return SYNC_STATUS_LABEL[this.sync.status()];
  }
  get projectionLockedHint(): string {
    return this.projection.available ? '' : 'A projeção é liberada quando a 1ª rodada termina.';
  }
  /** The six organizer pages are one lazy feature. */
  get isTournamentPage(): boolean {
    return (
      this.page === 'overview' ||
      this.page === 'players' ||
      this.page === 'rounds' ||
      this.page === 'ranking' ||
      this.page === 'projection' ||
      this.page === 'settings'
    );
  }

  constructor() {
    const url = this.urlState.snapshot();
    this.authCallback = url.authCallback;
    this.appBasePath = this.urlState.basePath;
    this.theme = this.storage.loadTheme();
    if (!this.isSharedView) {
      try {
        this.isLocked =
          this.config.lockScreenEnabled &&
          !this.isDashboardRoute &&
          !this.authCallback &&
          this.session.getItem(UNLOCK_SESSION_KEY) !== 'true';
      } catch {
        this.isLocked = this.config.lockScreenEnabled && !this.isDashboardRoute && !this.authCallback;
      }
      this.showLanding = !this.isDashboardRoute && !this.authCallback && !landingSeen(this.local);
    }
    this.startup.restore();
  }

  ngOnInit(): void {
    void this.startApp();
  }

  private async startApp(): Promise<void> {
    this.stopPathWatch = this.urlState.onPathChange(() => this.restorePageFromPath());
    this.applyTheme();
    // Os tokens do link mágico ficam no hash da URL; o PostHog só pode iniciar depois que saem dela.
    if (this.authCallback) {
      await this.auth.finishUrlSignIn();
      await this.urlState.clearAuthFragment();
    }
    this.analytics.start();
    this.analytics.logInfo('setpoint application initialized', {
      hosting_mode: this.state.hostingMode,
      is_guest_view: this.isSharedView,
    });
    this.analytics.capture('app_opened', {
      view: this.page,
      hosting_mode: this.state.hostingMode,
      has_schedule: this.state.rounds.length > 0,
      is_guest_view: this.isSharedView,
    });
    this.navigation.trackViewed(this.page);
    if (this.page === 'setup') this.setup.viewed();
    if (!this.isSharedView) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 600);
    if (!this.isSharedView && !this.isDashboardRoute) {
      this.prefetchTournamentViews();
      window.setTimeout(() => this.prefetchDialogs(), 3000);
    }
    this.authStateUnsubscribe = this.auth.onAuthStateChange((change, user) => {
      if (change === 'signed-in' && user) this.identifyUser(user);
      if (change === 'signed-out') {
        this.analytics.reset();
        this.identifiedUserId = null;
      }
    });
    void this.identifyCurrentUser();
    // The shared view runs its own clock, poll and realtime watch.
    this.startup.start(this.isLocked);
  }

  ngOnDestroy(): void {
    this.stopPathWatch?.();
    this.authStateUnsubscribe?.();
    this.startup.stop();
  }

  private async identifyCurrentUser(): Promise<void> {
    const user = await this.auth.currentUser();
    if (user) this.identifyUser(user);
  }

  private identifyUser(user: AppUser): void {
    if (this.identifiedUserId && this.identifiedUserId !== user.id) {
      this.analytics.reset();
    }
    this.analytics.identify(user.id);
    this.identifiedUserId = user.id;
  }

  openProjection(): void {
    if (!this.projection.open()) return;
    this.navigate('projection');
    window.scrollTo({ top: 0 });
  }
  /** The landing page's way into the app (the landing has already remembered that it was seen). */
  enterApp(): void {
    this.showLanding = false;
    window.scrollTo({ top: 0 });
    window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 400);
  }

  /** The setup tour may start now (the shell has checked nothing else is on screen); the setup page runs it. */
  private cueSetupTour(): void {
    if (this.isLocked || this.showLanding || this.isDashboardRoute || this.profileOpen) return;
    if (this.page !== 'setup') return;
    this.setupTourCue.request();
  }

  /**
   * On the first visit (after the landing page) the profile panel opens once so the organizer can say who they are.
   * Whatever would open next (setup tour, saved tournaments) waits until the panel is closed, so overlays never stack.
   */
  private welcomeThen(next: () => void): void {
    if (this.isLocked || this.showLanding || this.isDashboardRoute || this.profileOpen) return next();
    if (!this.profileStore.takeWelcomePrompt()) return next();
    void this.openProfile(true, next);
  }

  handleBrandClick(): void {
    if (!this.state.startedAt) {
      this.openLanding();
      return;
    }
    this.navigate(this.hasSchedule ? 'overview' : 'setup');
  }

  /** Returning organizers go straight to their saved tournaments, skipping the first-visit tour. */
  continueFromLanding(): void {
    this.showLanding = false;
    window.scrollTo({ top: 0 });
    this.welcomeThen(() => void this.openLibrary());
  }

  openLanding(): void {
    this.setupTourCue.take();
    this.showLanding = true;
    window.scrollTo({ top: 0 });
  }

  unlock(): void {
    if (this.sitePassword !== ACCESS_PASSWORD) {
      this.sitePassword = '';
      this.lockError = 'Senha incorreta. Tente novamente.';
      return;
    }
    try {
      this.session.setItem(UNLOCK_SESSION_KEY, 'true');
    } catch {
      /* desbloqueio vale até recarregar */
    }
    this.isLocked = false;
    this.sitePassword = '';
    this.lockError = '';
    this.startup.afterUnlock();
    if (!this.showLanding) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 300);
  }

  /** The setup wizard's "start": draws the schedule. */
  protected generateSchedule(): void {
    void this.lifecycle.generateSchedule();
  }

  /** Archives the moderator's shared tournament (from the setup page: the person stays where they are). */
  protected cancelShared(): void {
    void this.landingAfter(this.lifecycle.cancelShared());
  }

  /** What a tournament page asks of the shell, which owns navigation, the URL and the landing page. */
  protected onTournamentRequest(request: ShellRequest): void {
    switch (request.kind) {
      case 'navigate':
        this.navigate(request.page);
        return;
      case 'finalized':
        // The tournament was finished (the store saved it): the report is in Ajustes.
        this.navigation.setPage('settings');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (this.state.hostingMode !== 'shared') this.archive.recordMetrics();
        return;
      case 'cancelShared':
        void this.landingAfter(this.lifecycle.cancelShared());
        return;
      case 'reset':
        void this.landingAfter(this.lifecycle.reset());
        return;
      case 'importBackup':
        void this.lifecycle.importBackup(request.file);
        return;
      case 'openLibrary':
        void this.openLibrary();
        return;
      case 'openLanding':
        this.openLanding();
        return;
      case 'syncPaused':
        this.sync.setPaused(request.paused);
        return;
      case 'syncNow':
        this.sync.syncNow();
        return;
    }
  }

  private async landingAfter(flow: Promise<boolean>): Promise<void> {
    if (await flow) this.openLanding();
  }

  navigate(page: Page): void {
    this.navigation.setPage(page);
    this.notices.clear();
  }

  private restorePageFromPath(): void {
    if (this.navigation.restoreFromPath()) void this.identifyCurrentUser();
  }

  /**
   * The profile panel, a lazy dialog. `afterWelcome` is what waits for the first-visit panel to close (the setup tour,
   * the saved tournaments), so overlays never stack. From the panel the organizer can go on to "Meus torneios".
   */
  async openProfile(welcome = false, afterWelcome?: () => void): Promise<void> {
    if (this.profileOpen) return;
    this.setupTourCue.take();
    this.profileOpen = true;
    let result: ProfileDialogResult | undefined;
    try {
      const {
        ProfileDialogComponent: component,
        PROFILE_TITLE_ID: labelledBy,
        PROFILE_WELCOME_TEXT_ID: welcomeTextId,
      } = await import('./features/profile/profile-dialog.component');
      result = await this.dialog.open<ProfileDialogResult, ProfileDialogData, ProfileDialogComponent>(component, {
        data: {
          welcome,
          currentLibraryId: libraryId(this.state),
          shell: this.profileShell,
          setTheme: (mode) => this.setTheme(mode),
        },
        labelledBy,
        describedBy: welcome ? welcomeTextId : undefined,
        id: 'profilePanel',
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-light',
        anchor: { top: '72px', right: 'max(16px, calc((100vw - 1160px) / 2 + 28px))' },
        sheetBelow: 560,
      });
    } catch {
      // The panel is a lazy chunk: offline or after a deploy it may not load. Whatever waited for it still goes on.
      this.notices.showKey('profileFailed', 'error');
      if (welcome && afterWelcome) afterWelcome();
      return;
    } finally {
      this.profileOpen = false;
    }
    if (result?.kind === 'library') void this.openLibrary();
    else if (result?.kind === 'open') await this.lifecycle.openSaved(result.id);
    else if (welcome && afterWelcome) window.setTimeout(afterWelcome, 250);
  }

  /**
   * Loads the tournament pages (their code and their text) at once, not on the first click: scoring at the court must
   * keep working after the connection drops, and with no service worker a page that was never opened cannot be fetched.
   */
  private prefetchTournamentViews(): void {
    void import('./features/tournament/tournament.component').catch(() => undefined);
    void import('./features/tournament/tie-draw-dialog/tie-draw-dialog.component').catch(() => undefined);
    for (const scope of ['organizer/pt-BR', 'tournament/pt-BR'])
      this.transloco.load(scope).subscribe({ error: () => undefined });
  }

  /** Loads the profile and library dialogs while online, so they still open at the court without a connection. */
  private prefetchDialogs(): void {
    void import('./features/profile/profile-dialog.component').catch(() => undefined);
    void import('./features/library/library-dialog.component').catch(() => undefined);
  }

  ngDoCheck(): void {
    this.refreshShellState();
  }

  private refreshShellState(): void {
    this.shellState.set({
      syncAvailable: this.sync.available(),
      syncStatus: this.sync.status(),
      hasPendingSync: this.sync.hasPending(),
      syncPaused: this.sync.paused(),
      syncing: this.sync.inFlight(),
      online: this.sync.online(),
      syncError: this.sync.error(),
      theme: this.theme,
    });
  }

  setTheme(mode: ThemeMode): void {
    if (this.theme === mode) return;
    this.theme = mode;
    this.storage.saveTheme(this.theme);
    this.applyTheme();
    this.refreshShellState();
  }
  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.theme;
  }

  /** "Meus torneios", a lazy dialog. It opens a saved tournament through the lifecycle. */
  async openLibrary(): Promise<void> {
    if (this.libraryOpen) return;
    this.libraryOpen = true;
    try {
      const { LibraryDialogComponent: component, LIBRARY_TITLE_ID: labelledBy } =
        await import('./features/library/library-dialog.component');
      await this.dialog.open<void, LibraryDialogData, LibraryDialogComponent>(component, {
        data: { currentId: libraryId(this.state), open: (id) => this.lifecycle.openSaved(id) },
        labelledBy,
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-plain',
        sheetBelow: 620,
      });
    } catch {
      this.notices.showKey('libraryFailed', 'error');
    } finally {
      this.libraryOpen = false;
    }
  }
}
