import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TournamentArchive } from './core/archive/tournament-archive';
import { CurrentTournament } from './core/current-tournament';
import type { Page } from './core/models';
import { Notices } from './core/notices';
import { NpsFeedbackService } from './core/nps-feedback.service';
import { ANALYTICS } from './core/ports/analytics.port';
import { APP_CONFIG, versionLabel } from './core/ports/app-config.port';
import { AUTH } from './core/ports/auth.port';
import { LOCAL_STORE, SESSION_STORE } from './core/ports/key-value-store.port';
import { AppNavigation } from './core/routing/app-navigation';
import { URL_STATE } from './core/routing/url-state';
import { LocalProfileStore } from './core/local-profile.store';
import { SavedTournaments } from './core/saved-tournaments';
import { SetupProgress } from './core/setup-progress';
import { ShellContext } from './core/shell-context';
import { SyncErrorText } from './core/sync/sync-error-text';
import { TournamentSync } from './core/sync/tournament-sync';
import { ThemeService } from './core/theme';
import * as tournamentFormat from './domain/tournament-view/format';
import { PlayerAvatarComponent } from './features/player-avatar.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { landingSeen } from './features/landing/data/landing-visit';
import { LandingComponent } from './features/landing/landing.component';
import { SetupTourCue } from './features/setup/data/setup-tour-cue';
import { SetupComponent } from './features/setup/setup.component';
import { SharedViewComponent } from './features/shared-view/shared-view.component';
import type { ShellRequest } from './features/tournament/data/tournament.store';
import { ProjectionController } from './features/tournament/projection/projection-controller';
import { TournamentComponent } from './features/tournament/tournament.component';
import { AnalyticsIdentity } from './shell/analytics-identity';
import { PageAnnouncer, type ScreenKey } from './shell/page-announcer';
import { provideHostProjection } from './shell/host-projection';
import { ShellDialogs } from './shell/shell-dialogs';
import { prefetchDialogs, prefetchTournamentViews } from './shell/shell-prefetch';
import { ShellStartup } from './shell/shell-startup';
import { ShellState } from './shell/shell-state';
import { TournamentLifecycle } from './shell/tournament-lifecycle';

const ACCESS_PASSWORD = 'bt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';

/**
 * The shell: the lock screen, the landing page, the top bar and nav, the address glue and the lazy features it renders.
 * What it knows is signals (it is OnPush); what the app does (sync, saving, the tournament flows, the dialogs) is in
 * root services, and what the tournament pages ask of it arrives as `ShellRequest`.
 */
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);
  private readonly config = inject(APP_CONFIG);
  private readonly urlState = inject(URL_STATE);
  private readonly auth = inject(AUTH);
  private readonly analytics = inject(ANALYTICS);
  private readonly tournament = inject(CurrentTournament);
  private readonly setup = inject(SetupProgress);
  private readonly transloco = inject(TranslocoService);
  private readonly setupTourCue = inject(SetupTourCue);
  private readonly archive = inject(TournamentArchive);
  private readonly lifecycle = inject(TournamentLifecycle);
  private readonly startup = inject(ShellStartup);
  private readonly identity = inject(AnalyticsIdentity);
  private readonly navigation = inject(AppNavigation);
  private readonly theme = inject(ThemeService);
  private readonly changes = inject(ChangeDetectorRef);
  private readonly announcer = inject(PageAnnouncer);
  private stopPathWatch: (() => void) | null = null;

  protected readonly sync = inject(TournamentSync);
  protected readonly syncErrors = inject(SyncErrorText);
  protected readonly notices = inject(Notices);
  protected readonly nps = inject(NpsFeedbackService);
  protected readonly projection = inject(ProjectionController);
  protected readonly savedTournaments = inject(SavedTournaments);
  protected readonly profileStore = inject(LocalProfileStore);
  protected readonly dialogs = inject(ShellDialogs);
  protected readonly shellState = inject(ShellState);

  /** The address opens someone else's tournament: the page is the lazy shared view and no owner startup runs. */
  private readonly context = inject(ShellContext);
  protected readonly isSharedView = this.context.isSharedView;
  protected readonly versionLabel = versionLabel(this.config);
  protected readonly isLocked = signal(false);
  protected readonly showLanding = signal(false);
  protected readonly sitePassword = signal('');
  protected readonly lockFailed = signal(false);

  protected readonly page = this.navigation.page;
  protected readonly isDashboardRoute = this.navigation.dashboardRoute;
  protected readonly state = this.tournament.state;
  protected readonly hasSchedule = computed(() => this.state().rounds.length > 0);
  protected readonly isGroupTournament = computed(() => tournamentFormat.isGroupTournament(this.state()));
  /** The six organizer pages are one lazy feature. */
  protected readonly isTournamentPage = computed(() =>
    ['overview', 'players', 'rounds', 'ranking', 'projection', 'settings'].includes(this.page()),
  );
  /** The name in the profile button's label, without braces (a translation parameter must not look like `{{x}}`). */
  protected readonly profileName = computed(() => this.profileStore.profile().name.replace(/[{}]/g, ''));

  /** The screen in front of the person, for the document title and the focus after a change. */
  private readonly screen = computed<ScreenKey>(() => {
    if (this.isLocked()) return 'lock';
    if (this.isDashboardRoute()) return 'dashboard';
    if (this.showLanding()) return 'landing';
    return this.page();
  });

  constructor() {
    effect(() => this.announcer.announce(this.screen()));
    const url = this.urlState.snapshot();
    if (!this.isSharedView) {
      const canLock = this.config.lockScreenEnabled && !url.dashboardPath && !url.authCallback;
      try {
        this.isLocked.set(canLock && this.session.getItem(UNLOCK_SESSION_KEY) !== 'true');
      } catch {
        this.isLocked.set(canLock);
      }
      this.showLanding.set(!url.dashboardPath && !url.authCallback && !landingSeen(this.local));
    }
    this.startup.restore();
  }

  ngOnInit(): void {
    void this.startApp();
  }

  private async startApp(): Promise<void> {
    this.stopPathWatch = this.urlState.onPathChange(() => this.restorePageFromPath());
    this.theme.apply();
    // Os tokens do link mágico ficam no hash da URL; o PostHog só pode iniciar depois que saem dela.
    if (this.context.authCallback) {
      await this.auth.finishUrlSignIn();
      await this.urlState.clearAuthFragment();
    }
    this.analytics.start();
    // The footer's survey button depends on the analytics client that has just started.
    this.changes.markForCheck();
    const state = this.state();
    this.analytics.logInfo('setpoint application initialized', {
      hosting_mode: state.hostingMode,
      is_guest_view: this.isSharedView,
    });
    this.analytics.capture('app_opened', {
      view: this.page(),
      hosting_mode: state.hostingMode,
      has_schedule: state.rounds.length > 0,
      is_guest_view: this.isSharedView,
    });
    this.navigation.trackViewed(this.page());
    if (this.page() === 'setup') this.setup.viewed();
    if (!this.isSharedView) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 600);
    if (!this.isSharedView && !this.isDashboardRoute()) {
      prefetchTournamentViews(this.transloco);
      window.setTimeout(() => prefetchDialogs(), 3000);
    }
    this.identity.start();
    // The shared view runs its own clock, poll and realtime watch.
    this.startup.start(this.isLocked());
  }

  ngOnDestroy(): void {
    this.stopPathWatch?.();
    this.identity.stop();
    this.startup.stop();
  }

  /** The skip link: the address would change with a plain `#` link, so focus the content ourselves. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected openProfile(welcome = false, afterWelcome?: () => void): Promise<void> {
    return this.dialogs.openProfile(welcome, afterWelcome);
  }

  protected openProjection(): void {
    if (!this.projection.open()) return;
    this.navigate('projection');
    window.scrollTo({ top: 0 });
  }

  /** The landing page's way into the app (the landing has already remembered that it was seen). */
  protected enterApp(): void {
    this.showLanding.set(false);
    window.scrollTo({ top: 0 });
    window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 400);
  }

  /** Returning organizers go straight to their saved tournaments, skipping the first-visit tour. */
  protected continueFromLanding(): void {
    this.showLanding.set(false);
    window.scrollTo({ top: 0 });
    this.welcomeThen(() => void this.dialogs.openLibrary());
  }

  protected openLanding(): void {
    this.setupTourCue.take();
    this.showLanding.set(true);
    window.scrollTo({ top: 0 });
  }

  protected handleBrandClick(): void {
    if (!this.state().startedAt) {
      this.openLanding();
      return;
    }
    this.navigate(this.hasSchedule() ? 'overview' : 'setup');
  }

  /** The setup tour may start now (the shell has checked nothing else is on screen); the setup page runs it. */
  private cueSetupTour(): void {
    if (this.isLocked() || this.showLanding() || this.isDashboardRoute() || this.dialogs.profileOpen()) return;
    if (this.page() !== 'setup') return;
    this.setupTourCue.request();
  }

  /**
   * On the first visit (after the landing page) the profile panel opens once so the organizer can say who they are.
   * Whatever would open next (setup tour, saved tournaments) waits until the panel is closed, so overlays never stack.
   */
  private welcomeThen(next: () => void): void {
    if (this.isLocked() || this.showLanding() || this.isDashboardRoute() || this.dialogs.profileOpen()) return next();
    if (!this.profileStore.takeWelcomePrompt()) return next();
    void this.dialogs.openProfile(true, next);
  }

  protected unlock(): void {
    if (this.sitePassword() !== ACCESS_PASSWORD) {
      this.sitePassword.set('');
      this.lockFailed.set(true);
      return;
    }
    try {
      this.session.setItem(UNLOCK_SESSION_KEY, 'true');
    } catch {
      /* desbloqueio vale até recarregar */
    }
    this.isLocked.set(false);
    this.sitePassword.set('');
    this.lockFailed.set(false);
    this.startup.afterUnlock();
    if (!this.showLanding()) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 300);
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
        if (this.state().hostingMode !== 'shared') this.archive.recordMetrics();
        return;
      case 'cancelShared':
        this.cancelShared();
        return;
      case 'reset':
        void this.landingAfter(this.lifecycle.reset());
        return;
      case 'importBackup':
        void this.lifecycle.importBackup(request.file);
        return;
      case 'openLibrary':
        void this.dialogs.openLibrary();
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

  protected navigate(page: Page): void {
    this.navigation.setPage(page);
    this.notices.clear();
  }

  private restorePageFromPath(): void {
    if (this.navigation.restoreFromPath()) void this.identity.identifyCurrent();
  }
}
