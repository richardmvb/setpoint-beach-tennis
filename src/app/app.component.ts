import { Component, DoCheck, inject, OnDestroy, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DoublesFormat,
  FinalMatchKind,
  Match,
  MixedFinalFormat,
  Page,
  PlayerStanding,
  SharedTournamentSnapshot,
  ThemeMode,
  TournamentMode,
  GroupFormat,
  TournamentSize,
  TournamentState,
} from './core/models';
import { StorageService } from './core/storage.service';
import { CurrentTournament } from './core/current-tournament';
import { OwnedSharedTournament, SHARED_SETUP_KEY } from './core/owned-shared-tournament';
import { SetupProgress } from './core/setup-progress';
import {
  availableCourts,
  availableGamesToWin,
  availableSizes,
  newTournament,
  requiredRounds,
  withCourts,
  withDoublesFormat,
  withEarlyFinals,
  withGroupFormat,
  withMixedFinalFormat,
  withSize,
  withTournamentMode,
} from './domain/tournament-setup/setup-rules';
import { addPlayer, removePlayer } from './domain/tournament-setup/players';
import { SetupTourCue } from './features/setup/data/setup-tour-cue';
import { LocalProfileStore } from './core/local-profile.store';
import { SavedTournaments } from './core/saved-tournaments';
import type {
  ProfileDialogData,
  ProfileDialogResult,
  ProfileShellState,
} from './features/profile/data/profile-panel.store';
import type { ProfileDialogComponent } from './features/profile/profile-dialog.component';
import type { LibraryDialogData } from './features/library/data/library.store';
import type { LibraryDialogComponent } from './features/library/library-dialog.component';
import { OfflineSyncQueue, SyncKind } from './core/offline-sync-queue';
import { libraryId } from './core/tournament-library';
import { SYNC_STATUS_LABEL, syncStatus } from './core/state-machines';
import { ScheduleService } from './core/schedule.service';
import { GroupScheduleService } from './core/group-schedule.service';
import { FinalsService, PodiumPlace } from './core/finals.service';
import {
  calculateFinalLiveScore,
  FinalLivePoint,
  finalLiveMatchScore,
  MAX_FINAL_LIVE_POINTS,
} from './core/final-live-score';
import { ShareCardService } from './core/share-card.service';
import type { FinalWinnerSide } from './domain/tournament-view/scoring';
import { isScored } from './domain/tournament-view/scoring';
import * as tournamentFormat from './domain/tournament-view/format';
import * as tournamentProgress from './domain/tournament-view/progress';
import { createStandingsMemo, type StandingsView, storedTieDrawOrder } from './domain/tournament-view/standings';
import { type GroupStandingTable, groupTables } from './domain/tournament-view/group-tables';
import type {
  PlayerMatchesDialogComponent,
  PlayerMatchesDialogData,
} from './features/tournament/player-matches-dialog/player-matches-dialog.component';
import type {
  ShareResultsDialogComponent,
  ShareResultsDialogData,
} from './features/tournament/share-results-dialog/share-results-dialog.component';
import { ShareResultsSession } from './features/tournament/share-results-dialog/share-results-session';
import { RankingViewComponent } from './features/ranking-view.component';
import { RoundNavigationComponent } from './features/round-navigation.component';
import { PlayerAvatarComponent } from './features/player-avatar.component';
import { FinalLiveScoreComponent } from './features/final-live-score.component';
import { TournamentReportComponent } from './features/tournament-report.component';
import { PodiumComponent } from './features/podium.component';
import { ANALYTICS } from './core/ports/analytics.port';
import { ARCHIVE } from './core/ports/archive.port';
import { AppUser, AUTH } from './core/ports/auth.port';
import { APP_CONFIG, versionLabel } from './core/ports/app-config.port';
import { CLOCK } from './core/ports/clock.port';
import { LOCAL_STORE, SESSION_STORE } from './core/ports/key-value-store.port';
import { RANDOM } from './core/ports/random.port';
import { URL_STATE } from './core/routing/url-state';
import { TOURNAMENT_FEED } from './core/ports/live-feed.port';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from './core/ports/tournaments.port';
import { publicTournamentState } from './core/public-tournament-state';
import { DialogService } from './core/dialog.service';
import { exportTournamentBackup } from './core/backup-export';
import { NpsFeedbackService } from './core/nps-feedback.service';
import { ProjectionController } from './features/tournament/projection/projection-controller';
import { ProjectionPanelComponent } from './features/tournament/projection/projection-panel.component';
import { SharedViewComponent } from './features/shared-view/shared-view.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LandingComponent } from './features/landing/landing.component';
import { SetupComponent } from './features/setup/setup.component';
import { landingSeen } from './features/landing/data/landing-visit';

const ACCESS_PASSWORD = 'bt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';
const LOCAL_LIVE_KEY = 'setpoint.local.live';
const SYNC_PAUSED_KEY = 'setpoint.sync.paused';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RankingViewComponent,
    RoundNavigationComponent,
    PlayerAvatarComponent,
    PodiumComponent,
    ProjectionPanelComponent,
    SharedViewComponent,
    DashboardComponent,
    LandingComponent,
    SetupComponent,
    FinalLiveScoreComponent,
    TournamentReportComponent,
    TranslocoPipe,
  ],
  providers: [ProjectionController],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, DoCheck, OnDestroy {
  private storage = inject(StorageService);
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);
  private readonly clock = inject(CLOCK);
  private readonly random = inject(RANDOM);
  private readonly config = inject(APP_CONFIG);
  private readonly urlState = inject(URL_STATE);
  private stopPathWatch: (() => void) | null = null;
  private scheduler = inject(ScheduleService);
  private groupScheduler = inject(GroupScheduleService);
  private finalsScheduler = inject(FinalsService);
  private readonly sharedTournaments = inject(SHARED_TOURNAMENTS);
  private readonly localLive = inject(LOCAL_LIVE);
  private readonly feed = inject(TOURNAMENT_FEED);
  private readonly archive = inject(ARCHIVE);
  private readonly auth = inject(AUTH);
  private shareCard = inject(ShareCardService);

  private readonly analytics = inject(ANALYTICS);
  protected readonly nps = inject(NpsFeedbackService);
  protected readonly projection = inject(ProjectionController);
  private readonly dialog = inject(DialogService);
  private readonly shareSession = inject(ShareResultsSession);
  private readonly tournament = inject(CurrentTournament);
  private readonly owned = inject(OwnedSharedTournament);
  private readonly setup = inject(SetupProgress);
  private readonly setupTourCue = inject(SetupTourCue);
  private readonly authCallback: boolean;
  private readonly syncQueue = new OfflineSyncQueue(this.local);

  protected readonly savedTournaments = inject(SavedTournaments);
  private readonly library = this.savedTournaments.library;
  protected readonly profileStore = inject(LocalProfileStore);
  private archiveInFlight = false;
  private archiveRetryAfter = 0;
  private versionResetKeptTournament = false;
  /** The profile dialog is open: setup tours and the saved-tournaments prompt wait for it to close. */
  profileOpen = false;
  /** The saved-tournaments dialog is open (or loading), so a second click does not stack another. */
  private libraryOpen = false;
  /** The shell's state that the profile dialog shows, refreshed on every check while it is open (until B5 makes the shell signal-based). */
  private readonly profileShell = signal<ProfileShellState>(
    { sync: 'device-only', syncWarning: false, syncError: '', theme: 'light' },
    {
      equal: (a, b) =>
        a.sync === b.sync && a.syncWarning === b.syncWarning && a.syncError === b.syncError && a.theme === b.theme,
    },
  );
  isLocked = false;
  showLanding = false;
  sitePassword = '';
  lockError = '';
  page: Page = 'setup';
  theme: ThemeMode = 'light';
  /** The tournament being run: the one `CurrentTournament` holds, so the features see it too. */
  get state(): TournamentState {
    return this.tournament.state();
  }
  set state(value: TournamentState) {
    this.tournament.set(value);
  }
  selectedRound = 0;
  /** The Jogadores page's form. It is only reachable once the schedule exists, so it is always disabled (B4 removes it). */
  newPlayerName = '';
  private readonly standingsMemo = createStandingsMemo();
  /** Decides the winner of a final (the domain gets this rule instead of importing the score engine). */
  private readonly winnerSide: FinalWinnerSide = (match) => this.finalsScheduler.winnerSide(match);
  notice = '';
  noticeType: 'success' | 'error' = 'success';
  scoreDrafts: Record<
    string,
    { a: number | null; b: number | null; tieBreakA?: number | null; tieBreakB?: number | null }
  > = {};
  tieDrawModalOpen = false;
  activeTiePlayerIds: string[] = [];
  activeTieDrawResult: string[] = [];
  now = this.clock.now();
  private clockTimer: number | null = null;
  /**
   * The address opens someone else's tournament (live link, invite or admin viewer). The page is then the lazy
   * `SharedViewComponent`, and none of the device's own tournament, sync, library or version reset runs.
   */
  readonly isSharedView: boolean;
  /** The moderator's own shared tournament lives in `OwnedSharedTournament`; these are the shell's views of it. */
  get isSharedModerator(): boolean {
    return this.owned.moderator();
  }
  set isSharedModerator(value: boolean) {
    this.owned.setModerator(value);
  }
  get sharedSnapshot(): SharedTournamentSnapshot | null {
    return this.owned.snapshot();
  }
  get sharedLoading(): boolean {
    return this.owned.loading();
  }
  sharePlayerId = '';
  private syncTimeout: number | null = null;
  private syncInFlight = false;
  private syncRetryAfter = 0;
  syncPaused = false;
  syncError = '';
  connectionOnline = navigator.onLine;
  private sharedPollTimer: number | null = null;
  private authStateUnsubscribe: (() => void) | null = null;
  private identifiedUserId: string | null = null;
  /** The athlete the host picked in the projection; empty means the leader. */
  private qualificationTargetPlayerId = '';
  isDashboardRoute = false;
  localLiveLoading = false;
  localLiveError = '';
  localLiveNotice = '';
  localLiveUrl = '';
  private localLiveReadToken = '';
  private localLiveWriteToken = '';
  private localLiveId = '';
  private localLiveAnalyticsId = '';
  appBasePath = '';
  private readonly onPopState = (): void => this.restorePageFromPath();
  private readonly onConnectionChange = (): void => {
    this.connectionOnline = navigator.onLine;
    if (this.connectionOnline) {
      void this.syncPending();
      void this.flushArchives();
    }
  };

  constructor() {
    // The schedule services default to Math.random; production draws go through the Random port instead.
    this.scheduler.random = () => this.random.next();
    this.groupScheduler.random = () => this.random.next();
    this.tournament.connect({
      save: (success) => this.persist(success),
      notify: (text, tone) => this.message(text, tone),
      clearNotice: () => this.clearNotice(),
    });
    this.owned.connect({ applied: (snapshot, keepView) => this.onSharedApplied(snapshot, keepView) });
    this.projection.connect({
      state: () => this.state,
      standings: () => this.standings,
      playerId: () => this.qualificationPlayerId,
      isGuest: false,
      viewing: () => this.page === 'projection',
    });
    const url = this.urlState.snapshot();
    this.authCallback = url.authCallback;
    this.appBasePath = this.urlState.basePath;
    this.isDashboardRoute = url.dashboardPath;
    this.isSharedView = !url.dashboardPath && !!(url.inviteToken || url.liveToken || url.dashboardViewerId);
    this.theme = this.storage.loadTheme();
    if (this.isSharedView) {
      // Only a placeholder: the shared view reads its own tournament. Its hosting mode is what analytics reports.
      this.state = newTournament(this.clock.iso());
      this.state.hostingMode = url.dashboardViewerId
        ? (url.dashboardViewerSource ?? 'shared')
        : url.liveToken
          ? 'local'
          : 'shared';
      this.page = 'shared';
      return;
    }
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
    this.state = this.storage.loadTournament() ?? newTournament(this.clock.iso());
    try {
      this.syncPaused = this.local.getItem(SYNC_PAUSED_KEY) === 'true';
      if (!this.isDashboardRoute) {
        const kind: SyncKind = this.state.hostingMode === 'shared' ? 'shared' : 'local';
        const id = kind === 'shared' ? this.state.sharedTournamentId : this.state.analyticsId;
        const record = id ? this.syncQueue.read(kind, id) : null;
        if (record?.pending) this.state = record.pending;
        if (kind === 'shared' && record && this.state.sharedStatus === 'active' && this.state.rounds.length)
          this.isSharedModerator = true;
      }
    } catch {
      this.syncError = 'Não foi possível acessar a fila de sincronização local.';
    }
    if (!this.isDashboardRoute) this.keepInLibrary(this.state);
    if (!this.hasPendingSync && this.storage.clearCompletedTournamentOnVersionChange(this.buildId, this.state)) {
      this.versionResetKeptTournament = !!libraryId(this.state) && !!this.library.get(libraryId(this.state) ?? '');
      this.state = newTournament(this.clock.iso());
    }
    this.state.tournamentMode ??= 'super';
    this.state.doublesFormat ??= 'open';
    this.state.doublesFormat ??= 'open';
    this.state.hostingMode ??= 'local';
    this.state.groupFormat ??= 'rotating';
    this.state.groups ??= [];
    this.state.fixedPairs ??= [];
    this.state.finals ??= null;
    this.state.tieBreakDraws ??= [];
    this.restoreLocalLiveCredentials();
    this.page = this.isDashboardRoute ? 'dashboard' : this.state.rounds.length ? 'overview' : 'setup';
    if (!this.state.rounds.length) {
      if (!this.availableCourts.includes(this.state.courts)) this.state.courts = Math.floor(this.state.size / 4);
      this.state.roundCount = this.requiredRounds;
    }
    this.initializeScoreDrafts();
    this.savedTournaments.refresh();
    if (this.versionResetKeptTournament)
      this.message('Nova versão do SETPOINT. Seu torneio anterior continua salvo em Meus torneios.');
  }

  ngOnInit(): void {
    void this.startApp();
  }

  private async startApp(): Promise<void> {
    this.stopPathWatch = this.urlState.onPathChange(this.onPopState);
    window.addEventListener('online', this.onConnectionChange);
    window.addEventListener('offline', this.onConnectionChange);
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
    this.trackFeatureViewed(this.page);
    if (this.page === 'setup') this.setup.viewed();
    if (!this.isSharedView) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 600);
    if (!this.isSharedView && !this.isDashboardRoute) window.setTimeout(() => this.prefetchDialogs(), 3000);
    this.authStateUnsubscribe = this.auth.onAuthStateChange((change, user) => {
      if (change === 'signed-in' && user) this.identifyUser(user);
      if (change === 'signed-out') {
        this.analytics.reset();
        this.identifiedUserId = null;
      }
    });
    void this.identifyCurrentUser();
    // The shared view runs its own clock, poll and realtime watch.
    if (this.isSharedView) return;
    if (!this.isLocked && !this.isDashboardRoute) {
      this.backfillLocalTournamentMetrics();
      this.archiveCurrent();
    }
    this.clockTimer = window.setInterval(() => {
      if (this.timerRunning) this.now = this.clock.now();
    }, 1000);
    this.sharedPollTimer = window.setInterval(() => this.pollShared(), 4000);
    void this.restoreOwnerSharedFlow();
    if (!this.isDashboardRoute) void this.syncPending();
  }

  ngOnDestroy(): void {
    this.stopPathWatch?.();
    window.removeEventListener('online', this.onConnectionChange);
    window.removeEventListener('offline', this.onConnectionChange);
    if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
    if (this.sharedPollTimer !== null) window.clearInterval(this.sharedPollTimer);
    if (this.syncTimeout !== null) window.clearTimeout(this.syncTimeout);
    this.authStateUnsubscribe?.();
    this.owned.stopWatching();
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

  get timerRunning(): boolean {
    return !!this.state.startedAt && !this.state.finishedAt;
  }
  get elapsedLabel(): string {
    return tournamentProgress.elapsedLabel(this.state, this.now);
  }
  get roundsLocked(): boolean {
    return !!this.state.finals;
  }
  get finalsLocked(): boolean {
    return !!this.state.finishedAt;
  }
  get canFinalizeTournament(): boolean {
    return this.canEditScores && !!this.state.finals?.complete && !this.state.finishedAt;
  }
  get canEditRoundScores(): boolean {
    return this.canEditScores && !this.roundsLocked;
  }
  get canEditFinalScores(): boolean {
    return this.canEditScores && !this.finalsLocked;
  }
  /** The dialogs are lazy chunks: they load on the first click, not with the app. */
  async openPlayerMatches(playerId: string): Promise<void> {
    const { PlayerMatchesDialogComponent: component, PLAYER_MATCHES_TITLE_ID: labelledBy } =
      await import('./features/tournament/player-matches-dialog/player-matches-dialog.component');
    await this.dialog.open<void, PlayerMatchesDialogData, PlayerMatchesDialogComponent>(component, {
      data: { state: this.state, playerId },
      labelledBy,
      sheetBelow: 620,
    });
  }
  /** The outcome of the last share (for example "Imagem baixada."), shown under the share button. */
  get shareMessage(): string {
    return this.shareSession.message();
  }

  placeOf(playerId: string): number {
    return this.shareCard.placementOf(this.state, this.standings, playerId);
  }
  get shareCandidates(): { playerId: string; name: string; place: number }[] {
    return this.state.players
      .map((player) => ({ playerId: player.id, name: player.name, place: this.placeOf(player.id) }))
      .sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
  }
  trackByPlayerId(_: number, item: { playerId: string }): string {
    return item.playerId;
  }
  trackByMatchId(_: number, item: Match): string {
    return item.id;
  }
  playerPhoto(playerId: string): string {
    return this.state.players.find((player) => player.id === playerId)?.photoDataUrl ?? '';
  }

  get sharedConfigured(): boolean {
    return this.auth.configured;
  }
  private get syncTarget(): { kind: SyncKind; id: string } | null {
    if (this.isSharedView || this.isDashboardRoute || !this.state) return null;
    if (this.state.hostingMode === 'shared' && this.state.sharedTournamentId)
      return { kind: 'shared', id: this.state.sharedTournamentId };
    if (this.state.hostingMode !== 'shared' && this.state.analyticsId)
      return { kind: 'local', id: this.state.analyticsId };
    return null;
  }
  get hasPendingSync(): boolean {
    try {
      const target = this.syncTarget;
      return !!target && !!this.syncQueue.read(target.kind, target.id)?.pending;
    } catch {
      return false;
    }
  }
  get syncing(): boolean {
    return this.syncInFlight;
  }
  get syncAvailable(): boolean {
    return (
      !this.isDashboardRoute &&
      ((this.isSharedMode && this.isSharedModerator && !!this.state.sharedTournamentId && !!this.state.rounds.length) ||
        (!this.isSharedMode && !!this.localLiveWriteToken))
    );
  }
  get syncStatus() {
    return syncStatus({
      available: this.syncAvailable,
      error: !!this.syncError,
      online: this.connectionOnline,
      paused: this.syncPaused,
      inFlight: this.syncInFlight,
      hasPending: this.hasPendingSync,
    });
  }
  get syncLabel(): string {
    return SYNC_STATUS_LABEL[this.syncStatus];
  }
  setSyncPaused(paused: boolean): void {
    this.syncPaused = paused;
    try {
      this.local.setItem(SYNC_PAUSED_KEY, String(paused));
    } catch {
      this.syncError = 'Não foi possível salvar a preferência de sincronização.';
    }
    if (!paused) {
      this.syncRetryAfter = 0;
      void this.syncPending();
    }
  }
  syncNow(): void {
    this.syncRetryAfter = 0;
    void this.syncPending(true);
  }

  private async syncPending(manual = false): Promise<void> {
    if (this.syncInFlight || !this.connectionOnline || (this.syncPaused && !manual)) return;
    const target = this.syncTarget;
    if (
      !target ||
      (target.kind === 'shared' && !this.isSharedModerator) ||
      (target.kind === 'local' && !this.localLiveWriteToken)
    )
      return;
    this.syncInFlight = true;
    try {
      while (this.syncTarget?.kind === target.kind && this.syncTarget?.id === target.id) {
        const record = this.syncQueue.read(target.kind, target.id);
        if (!record?.pending) break;
        const snapshot =
          target.kind === 'shared'
            ? await this.sharedTournaments.syncSharedTournament(target.id, record.base, record.pending)
            : await this.localLive.syncLocalLiveTournament(this.localLiveWriteToken, record.base, record.pending);
        this.syncQueue.acknowledge(target.kind, target.id, record.revision, snapshot.state);
        if (target.kind === 'shared' && this.state.sharedTournamentId === target.id) {
          this.state.sharedStatus = snapshot.status;
          if (this.sharedSnapshot?.id === snapshot.id) this.owned.replaceSnapshot(snapshot as SharedTournamentSnapshot);
          this.storage.saveTournament(this.state);
        }
        this.syncError = '';
        this.syncRetryAfter = 0;
        if (this.syncPaused && !manual) break;
      }
    } catch (error) {
      const detail = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
      this.syncError = detail.includes('sync_conflict')
        ? 'O torneio mudou em outro dispositivo. As alterações locais estão preservadas; exporte um backup antes de resolver o conflito.'
        : detail.includes('expired') ||
            detail.includes('tournament_completed') ||
            detail.includes('tournament_archived')
          ? 'O torneio no servidor expirou, foi arquivado ou já foi finalizado. Exporte um backup dos dados locais.'
          : 'Não foi possível sincronizar. Os dados permanecem neste dispositivo; tente novamente.';
      this.syncRetryAfter = this.clock.now() + 15000;
    } finally {
      this.syncInFlight = false;
    }
  }
  readonly buildId = this.config.buildId;
  readonly versionLabel = versionLabel(this.config);
  get isSharedMode(): boolean {
    return this.state.hostingMode === 'shared';
  }
  /** The athlete whose projection the host is looking at: the leader until another one is picked. */
  private get qualificationPlayerId(): string {
    return this.qualificationTargetPlayerId || this.standings[0]?.playerId || '';
  }
  setQualificationTargetPlayer(playerId: string): void {
    this.qualificationTargetPlayerId = playerId;
    this.projection.playerChanged();
  }
  get projectionLockedHint(): string {
    return this.projection.available ? '' : 'A projeção é liberada quando a 1ª rodada termina.';
  }
  openProjection(): void {
    if (!this.projection.open()) return;
    this.navigate('projection');
    window.scrollTo({ top: 0 });
  }
  setQualificationStats(enabled: boolean): void {
    if (this.hasSchedule) return;
    this.state.qualificationStats = enabled;
    this.persist();
  }
  get sharedInviteUrl(): string {
    return this.owned.inviteUrl();
  }
  get sharedStatusLabel(): string {
    if (this.sharedSnapshot?.status === 'archived') return 'Torneio arquivado';
    switch (this.sharedSnapshot?.status) {
      case 'registration':
        return 'Inscrições abertas';
      case 'ready':
        return 'Vagas preenchidas · aguardando início';
      case 'active':
        return 'Torneio em andamento';
      case 'completed':
        return 'Torneio concluído';
      default:
        return 'Carregando torneio';
    }
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
    this.navigate('overview');
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
    this.backfillLocalTournamentMetrics();
    this.archiveCurrent();
    if (!this.showLanding) window.setTimeout(() => this.welcomeThen(() => this.cueSetupTour()), 300);
  }

  private backfillLocalTournamentMetrics(): void {
    if (this.state.hostingMode === 'shared' || !this.state.startedAt || !this.state.rounds.length) return;
    this.state.analyticsId ??= this.id();
    try {
      this.storage.saveTournament(this.state);
    } catch {
      return;
    }
    this.syncLocalTournamentMetrics();
  }

  get hasSchedule(): boolean {
    return this.state.rounds.length > 0;
  }
  get canEditScores(): boolean {
    return !this.isSharedMode || (this.isSharedModerator && this.state.sharedStatus === 'active');
  }
  get hasFinals(): boolean {
    return !!this.state.finals;
  }
  get usesMixedFinals(): boolean {
    return tournamentFormat.usesMixedFinals(this.state);
  }
  get usesMixedFinalBracket(): boolean {
    return tournamentFormat.usesMixedFinalBracket(this.state);
  }
  get mixedFinalistCount(): number {
    return tournamentFormat.mixedFinalistCount(this.state);
  }
  get maleStandings(): PlayerStanding[] {
    return this.standingsView.male;
  }
  get femaleStandings(): PlayerStanding[] {
    return this.standingsView.female;
  }
  get isEarlyFinalsOptionAvailable(): boolean {
    return tournamentFormat.isEarlyFinalsOptionAvailable(this.state);
  }
  get earlyFinalsReady(): boolean {
    if (!this.state.earlyFinalsEnabled || !this.isEarlyFinalsOptionAvailable) return false;
    const matchCounts = this.standings.map((row) => row.matchesPlayed);
    return matchCounts.length > 0 && matchCounts[0] > 0 && matchCounts.every((count) => count === matchCounts[0]);
  }
  get canGenerateFinal(): boolean {
    const scheduleComplete = this.state.rounds.every((round) => round.matches.every((match) => this.isScored(match)));
    return (
      this.canEditScores &&
      this.hasSchedule &&
      !this.hasFinals &&
      this.state.players.length >= 8 &&
      (scheduleComplete || this.earlyFinalsReady)
    );
  }
  private podiumCache: { key: string; places: PodiumPlace[] } = { key: '', places: [] };
  // Memoized: a fresh array on every change detection (clock tick) would re-render and re-animate the podium.
  get finalPodium(): PodiumPlace[] {
    const finals = this.state.finals;
    const key = finals?.complete ? finals.podiumPlayerIds.join('|') : '';
    if (key !== this.podiumCache.key)
      this.podiumCache = { key, places: finals ? this.finalsScheduler.podium(finals) : [] };
    return this.podiumCache.places;
  }
  get unresolvedFinalTiePlayers(): PlayerStanding[] {
    let position = 0;
    for (const tiedPlayers of this.standingsView.groups) {
      if (tiedPlayers.length > 1 && position < 8 && storedTieDrawOrder(this.state, tiedPlayers) === null)
        return tiedPlayers;
      position += tiedPlayers.length;
    }
    return [];
  }
  get activeTiePositionLabel(): string {
    const positions = this.activeTiePlayerIds
      .map((id) => this.standings.findIndex((row) => row.playerId === id) + 1)
      .sort((a, b) => a - b);
    return positions.length ? positions.map((position) => `${position}º`).join(' e ') : '';
  }
  get isGroupTournament(): boolean {
    return tournamentFormat.isGroupTournament(this.state);
  }
  get isMixedDoubles(): boolean {
    return tournamentFormat.isMixedDoubles(this.state);
  }
  get fixedPairsMode(): boolean {
    return tournamentFormat.fixedPairsMode(this.state);
  }
  get availableGamesToWin(): number[] {
    return availableGamesToWin(this.state);
  }
  get availableSizes(): TournamentSize[] {
    return availableSizes(this.state);
  }
  get availableCourts(): number[] {
    return availableCourts(this.state);
  }
  get requiredRounds(): number {
    return requiredRounds(this.state);
  }
  get requiredCourts(): number {
    return this.state.courts;
  }
  get currentRound() {
    return this.state.rounds[this.selectedRound] ?? null;
  }
  get totalMatches(): number {
    return tournamentProgress.totalMatches(this.state);
  }
  get completedMatches(): number {
    return tournamentProgress.completedMatches(this.state, this.winnerSide);
  }
  get completedRounds(): number {
    return tournamentProgress.completedRounds(this.state);
  }
  get progress(): number {
    return tournamentProgress.progressPercent(this.state, this.winnerSide);
  }
  get groupTables(): GroupStandingTable[] {
    return groupTables(this.state, this.standings);
  }
  get standings(): PlayerStanding[] {
    return this.standingsView.all;
  }
  private get standingsView(): StandingsView {
    return this.standingsMemo(this.state);
  }

  navigate(page: Page): void {
    this.setPage(page);
    this.clearNotice();
  }

  private setPage(page: Page): void {
    if (this.page === page && (page !== 'dashboard' || this.isDashboardRoute)) return;
    if (page === 'dashboard') {
      this.isDashboardRoute = true;
      this.urlState.goToDashboard();
    } else if (this.isDashboardRoute) {
      this.isDashboardRoute = false;
      this.urlState.goHome();
    }
    if (this.page === 'projection') this.projection.leave();
    this.page = page;
    this.trackFeatureViewed(page);
  }

  private restorePageFromPath(): void {
    const dashboard = this.urlState.snapshot().dashboardPath;
    if (dashboard === this.isDashboardRoute) return;
    this.isDashboardRoute = dashboard;
    if (dashboard) {
      this.page = 'dashboard';
      void this.identifyCurrentUser();
    } else {
      this.page = this.isSharedView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    }
  }

  private trackFeatureViewed(page: Page): void {
    this.analytics.capture('feature_viewed', {
      feature: page === 'rounds' ? 'matches' : page,
      hosting_mode: this.state.hostingMode,
      is_guest_view: this.isSharedView,
    });
  }

  /**
   * The profile panel, a lazy dialog. `afterWelcome` is what waits for the first-visit panel to close (the setup tour,
   * the saved tournaments), so overlays never stack. From the panel the organizer can go on to "Meus torneios".
   */
  async openProfile(welcome = false, afterWelcome?: () => void): Promise<void> {
    if (this.profileOpen) return;
    this.setupTourCue.take();
    this.profileOpen = true;
    this.refreshProfileShell();
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
          shell: this.profileShell.asReadonly(),
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
      this.message('Não foi possível abrir o perfil agora. Verifique a conexão e tente de novo.', 'error');
      if (welcome && afterWelcome) afterWelcome();
      return;
    } finally {
      this.profileOpen = false;
    }
    if (result?.kind === 'library') void this.openLibrary();
    else if (result?.kind === 'open') await this.openLibraryTournament(result.id);
    else if (welcome && afterWelcome) window.setTimeout(afterWelcome, 250);
  }

  /** Loads the profile and library dialogs while online, so they still open at the court without a connection. */
  private prefetchDialogs(): void {
    void import('./features/profile/profile-dialog.component').catch(() => undefined);
    void import('./features/library/library-dialog.component').catch(() => undefined);
  }

  ngDoCheck(): void {
    if (this.profileOpen) this.refreshProfileShell();
  }

  private refreshProfileShell(): void {
    this.profileShell.set({
      sync: this.syncStatus,
      syncWarning:
        this.hasPendingSync || !!this.syncError || (this.syncAvailable && (!this.connectionOnline || this.syncPaused)),
      syncError: this.syncError,
      theme: this.theme,
    });
  }

  setTheme(mode: ThemeMode): void {
    if (this.theme === mode) return;
    this.theme = mode;
    this.storage.saveTheme(this.theme);
    this.applyTheme();
    this.refreshProfileShell();
  }
  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.theme;
  }

  saveSettings(): void {
    if (this.hasSchedule)
      return this.message('As configurações ficam bloqueadas depois da geração da tabela.', 'error');
    this.state.name = this.state.name.trim() || 'Meu torneio';
    if (this.state.players.length > this.state.size)
      return this.message(`Remova participantes até ficar com ${this.state.size}.`, 'error');
    this.state.roundCount = this.requiredRounds;
    this.state.courts = this.requiredCourts;
    this.persist('Configurações salvas.');
    this.analytics.capture('tournament_settings_saved', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      court_count: this.state.courts,
      games_to_win: this.state.gamesToWin,
    });
  }

  addPlayer(): void {
    const result = addPlayer(this.state, { name: this.newPlayerName, gender: '', avatar: '' }, this.id());
    if ('error' in result) return;
    this.state = result.state;
    this.newPlayerName = '';
    this.persist();
  }

  removePlayer(id: string): void {
    const result = removePlayer(this.state, id);
    if ('error' in result) return;
    this.state = result.state;
    this.persist();
  }

  changeSize(size: number): void {
    this.state = withSize(this.state, size);
  }

  changeCourts(courts: number): void {
    this.state = withCourts(this.state, courts);
  }

  setEarlyFinals(enabled: boolean): void {
    if (this.hasSchedule || !this.isEarlyFinalsOptionAvailable) return;
    this.state = withEarlyFinals(this.state, enabled);
    this.persist();
  }

  setMixedFinalFormat(format: MixedFinalFormat): void {
    if (this.hasSchedule || !this.isEarlyFinalsOptionAvailable) return;
    this.state = withMixedFinalFormat(this.state, format);
    this.persist();
  }

  changeTournamentMode(mode: TournamentMode): void {
    this.state = withTournamentMode(this.state, mode);
  }

  changeDoublesFormat(format: DoublesFormat): void {
    if (this.hasSchedule) return;
    this.state = withDoublesFormat(this.state, format);
    this.persist();
  }

  changeGroupFormat(format: GroupFormat): void {
    this.state = withGroupFormat(this.state, format);
  }

  copySharedInvite(): Promise<void> {
    return this.owned.copyInvite();
  }

  async createOrCopyLocalLiveLink(): Promise<void> {
    if (this.state.finishedAt) return;
    if (this.localLiveReadToken) return this.copyLocalLiveLink();
    if (!this.auth.configured) {
      this.localLiveError = 'A publicação ao vivo não está configurada neste deploy.';
      return;
    }
    this.localLiveLoading = true;
    this.localLiveError = '';
    this.localLiveNotice = '';
    try {
      this.state.analyticsId ??= this.id();
      const publishedState: TournamentState = structuredClone(this.state);
      const credentials = await this.localLive.createLocalLiveTournament(publishedState);
      this.localLiveId = credentials.id;
      this.localLiveReadToken = credentials.readToken;
      this.localLiveWriteToken = credentials.writeToken;
      this.localLiveAnalyticsId = this.state.analyticsId;
      this.localLiveUrl = this.createLocalLiveUrl(credentials.readToken);
      this.local.setItem(`${LOCAL_LIVE_KEY}.${this.state.analyticsId}`, JSON.stringify(credentials));
      this.syncQueue.initialize('local', this.state.analyticsId, publicTournamentState(publishedState));
      this.persist();
      this.library.requeue(this.state.analyticsId);
      void this.flushArchives();
      this.analytics.capture('local_live_link_created');
      await this.copyLocalLiveLink();
    } catch (error) {
      this.localLiveError = error instanceof Error ? error.message : 'Não foi possível gerar o link ao vivo.';
    } finally {
      this.localLiveLoading = false;
    }
  }

  async copyLocalLiveLink(): Promise<void> {
    if (!this.localLiveUrl) return;
    try {
      await navigator.clipboard.writeText(this.localLiveUrl);
      this.localLiveNotice = 'Link copiado. Envie para quem vai acompanhar.';
      this.localLiveError = '';
      this.analytics.capture('local_live_link_copied');
    } catch {
      this.localLiveError = 'Não foi possível copiar. Selecione e copie o link manualmente.';
    }
  }

  private createLocalLiveUrl(token: string): string {
    return this.urlState.liveUrl(token);
  }

  private restoreLocalLiveCredentials(): void {
    if (!this.state.analyticsId || this.state.hostingMode === 'shared') return;
    try {
      const stored = this.local.getItem(`${LOCAL_LIVE_KEY}.${this.state.analyticsId}`);
      if (!stored) return;
      const credentials = JSON.parse(stored) as { id?: string; readToken?: string; writeToken?: string };
      if (!credentials.id || !credentials.readToken || !credentials.writeToken) return;
      this.localLiveId = credentials.id;
      this.localLiveReadToken = credentials.readToken;
      this.localLiveWriteToken = credentials.writeToken;
      this.localLiveAnalyticsId = this.state.analyticsId;
      this.localLiveUrl = this.createLocalLiveUrl(credentials.readToken);
      this.syncQueue.initialize('local', this.state.analyticsId, publicTournamentState(this.state));
    } catch {
      /* link remains unavailable if browser storage is blocked */
    }
  }

  private clearLocalLiveCredentials(): void {
    try {
      if (this.localLiveAnalyticsId) this.local.removeItem(`${LOCAL_LIVE_KEY}.${this.localLiveAnalyticsId}`);
    } catch {
      /* sem armazenamento local */
    }
    this.localLiveReadToken = '';
    this.localLiveWriteToken = '';
    this.localLiveId = '';
    this.localLiveAnalyticsId = '';
    this.localLiveUrl = '';
    this.localLiveNotice = '';
  }

  async renewSharedInvite(): Promise<void> {
    await this.owned.renewInvite();
  }

  async shareResults(): Promise<void> {
    if (!this.state.finals?.complete || !this.sharePlayerId) return;
    const { ShareResultsDialogComponent: component, SHARE_RESULTS_TITLE_ID: labelledBy } =
      await import('./features/tournament/share-results-dialog/share-results-dialog.component');
    await this.dialog.open<void, ShareResultsDialogData, ShareResultsDialogComponent>(component, {
      data: { state: this.state, standings: this.standings, playerId: this.sharePlayerId },
      labelledBy,
      sheetBelow: 600,
    });
  }

  /** The moderator's own shared tournament: read it again from the server and keep watching it. */
  private async restoreOwnerSharedFlow(): Promise<void> {
    if (!this.auth.configured) return;
    this.local.removeItem(SHARED_SETUP_KEY);
    this.session.removeItem(SHARED_SETUP_KEY);

    if (this.state.hostingMode === 'shared' && this.state.sharedTournamentId && (await this.auth.currentUser())) {
      const keepLocal = !!this.syncQueue.read('shared', this.state.sharedTournamentId)?.pending;
      const snapshot = await this.owned.restore(this.state.sharedTournamentId, keepLocal);
      if (!snapshot) return;
      if (!snapshot.state.rounds?.length) {
        this.setPage('setup');
        this.setup.show(2);
      }
      void this.syncPending();
    }
  }

  /** The shared tournament became the current one: what only the shell does with it. */
  private onSharedApplied(snapshot: SharedTournamentSnapshot, keepView: boolean): void {
    if (this.isSharedModerator && snapshot.status === 'active' && snapshot.state.rounds?.length) {
      try {
        this.syncQueue.refreshBase('shared', snapshot.id, snapshot.state);
      } catch {
        this.syncError = 'Não foi possível preparar a sincronização neste dispositivo.';
      }
    }
    if (!keepView) this.setPage(this.state.rounds.length ? 'overview' : 'setup');
    this.initializeScoreDrafts();
  }

  // Garante a atualização mesmo quando o Realtime não entrega o aviso.
  private pollShared(): void {
    if (document.hidden || this.sharedLoading) return;
    if (this.hasPendingSync && this.clock.now() >= this.syncRetryAfter) void this.syncPending();
    if (this.isSharedModerator && this.state.sharedTournamentId && !this.state.rounds.length)
      void this.owned.refresh(this.state.sharedTournamentId);
  }

  async generateSchedule(): Promise<void> {
    if (this.state.players.length !== this.state.size) {
      return this.message(
        `Cadastre exatamente ${this.state.size} jogadores. Atualmente: ${this.state.players.length}.`,
        'error',
      );
    }
    if (this.hasSchedule) return this.message('A tabela já foi gerada.');
    if (this.isSharedMode && (!this.isSharedModerator || this.state.sharedStatus !== 'ready')) {
      return this.message(
        'O torneio compartilhado só pode iniciar pelo moderador quando todas as vagas estiverem preenchidas.',
        'error',
      );
    }
    const previousRounds = this.state.rounds;
    const previousGroups = this.state.groups;
    try {
      this.state.roundCount = this.requiredRounds;
      this.state.courts = this.requiredCourts;
      if (this.isGroupTournament) {
        const schedule = this.groupScheduler.generate(
          this.state.players,
          this.state.groupFormat ?? 'rotating',
          this.state.fixedPairs ?? [],
          this.isMixedDoubles,
        );
        this.state.groups = schedule.groups;
        this.state.rounds = schedule.rounds;
      } else {
        this.state.groups = [];
        this.state.rounds = this.scheduler.generate(
          this.state.players,
          this.state.size,
          this.state.courts,
          this.state.roundCount,
          this.isMixedDoubles,
        );
      }
      // A new object, so a feature showing the tournament (the setup review) sees the schedule appear.
      this.state = { ...this.state };
      if (this.isSharedMode && this.state.sharedTournamentId) {
        this.state.startedAt = this.clock.iso();
        const snapshot = await this.sharedTournaments.startSharedTournament(this.state.sharedTournamentId, this.state);
        this.owned.apply(snapshot);
      }
      this.state.startedAt ??= this.clock.iso();
      if (!this.isSharedMode) this.state.analyticsId ??= this.id();
      this.now = this.clock.now();
      this.selectedRound = 0;
      this.initializeScoreDrafts();
      this.persist('Todas as rodadas foram geradas e salvas.');
      this.setPage('rounds');
      if (!this.isSharedMode) this.syncLocalTournamentMetrics();
      this.setup.completed(3);
      if (!this.isSharedMode) {
        this.analytics.capture('tournament_created', {
          hosting_mode: this.state.hostingMode,
          tournament_mode: this.state.tournamentMode,
          doubles_format: this.state.doublesFormat ?? 'open',
          tournament_size: this.state.size,
        });
      }
      this.analytics.capture('tournament_started', {
        hosting_mode: this.state.hostingMode,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
      });
      this.analytics.capture('schedule_generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        hosting_mode: this.state.hostingMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
        court_count: this.state.courts,
      });
      this.analytics.logInfo('tournament schedule generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        hosting_mode: this.state.hostingMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
        court_count: this.state.courts,
      });
    } catch (error) {
      if (this.isSharedMode) {
        this.state = { ...this.state, rounds: previousRounds, groups: previousGroups };
      }
      this.message(error instanceof Error ? error.message : 'Erro ao gerar a tabela.', 'error');
    }
  }

  generateFinal(): void {
    if (!this.canGenerateFinal)
      return this.message('Conclua todas as partidas da fase atual para gerar a final.', 'error');
    const unresolvedTie = this.unresolvedFinalTiePlayers;
    if (unresolvedTie.length) {
      this.activeTiePlayerIds = unresolvedTie.map((player) => player.playerId);
      this.activeTieDrawResult = [];
      this.tieDrawModalOpen = true;
      return;
    }
    this.createFinals();
  }

  drawActiveTie(): void {
    if (!this.tieDrawModalOpen || this.activeTiePlayerIds.length < 2 || this.activeTieDrawResult.length) return;
    const order = [...this.activeTiePlayerIds];
    for (let index = order.length - 1; index > 0; index--) {
      const swapIndex = this.random.int(index + 1);
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    this.state.tieBreakDraws ??= [];
    this.state.tieBreakDraws.push({
      playerIds: [...this.activeTiePlayerIds].sort(),
      order,
      createdAt: this.clock.iso(),
    });
    this.activeTieDrawResult = order;
    this.persist('Sorteio registrado; a classificação foi atualizada.');
  }

  confirmTieDraw(): void {
    if (!this.activeTieDrawResult.length) return;
    const unresolvedTie = this.unresolvedFinalTiePlayers;
    if (unresolvedTie.length) {
      this.activeTiePlayerIds = unresolvedTie.map((player) => player.playerId);
      this.activeTieDrawResult = [];
      return;
    }
    this.tieDrawModalOpen = false;
    this.activeTiePlayerIds = [];
    this.activeTieDrawResult = [];
    this.createFinals();
  }

  cancelTieDraw(): void {
    this.tieDrawModalOpen = false;
    this.activeTiePlayerIds = [];
    this.activeTieDrawResult = [];
  }

  private createFinals(): void {
    if (!this.canGenerateFinal) return;
    try {
      this.state.finals = this.usesMixedFinalBracket
        ? this.finalsScheduler.createMixedBracket(this.maleStandings, this.femaleStandings)
        : this.usesMixedFinals
          ? this.finalsScheduler.createMixedDirect(this.maleStandings, this.femaleStandings)
          : this.finalsScheduler.create(this.standings);
      this.initializeScoreDrafts();
      this.persist(
        this.usesMixedFinalBracket
          ? 'Chave mista gerada com os oito melhores de cada categoria.'
          : this.usesMixedFinals
            ? 'Finais diretas geradas com os quatro melhores de cada categoria.'
            : 'Finais geradas com base nos oito primeiros do ranking.',
      );
      this.analytics.capture('finals_generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
      });
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Não foi possível gerar a final.', 'error');
    }
  }

  scoreChanged(match: Match, side: 'a' | 'b', value: number | null): void {
    if (!this.canEditRoundScores) return;
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    draft[side] = value;
    this.scoreDrafts[match.id] = draft;
    const a = draft.a;
    const b = draft.b;
    if (
      a === null ||
      b === null ||
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a > this.state.gamesToWin ||
      b > this.state.gamesToWin ||
      a === b ||
      Math.max(a, b) !== this.state.gamesToWin
    )
      return;
    if (match.scoreA === a && match.scoreB === b) return;
    match.scoreA = a;
    match.scoreB = b;
    this.scoreDrafts[match.id] = { a, b };
    this.persist();
    this.analytics.capture('match_score_recorded', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      round_number: this.selectedRound + 1,
      match_phase: match.phase ?? (this.isGroupTournament ? 'groups' : 'super'),
    });
  }

  scoreStatus(match: Match): string {
    const draft = this.scoreDrafts[match.id];
    if (!draft || draft.a === null || draft.b === null) return 'Preencha os dois placares';
    const valid =
      Number.isInteger(draft.a) &&
      Number.isInteger(draft.b) &&
      draft.a >= 0 &&
      draft.b >= 0 &&
      draft.a <= this.state.gamesToWin &&
      draft.b <= this.state.gamesToWin &&
      draft.a !== draft.b &&
      Math.max(draft.a, draft.b) === this.state.gamesToWin;
    if (!valid) return 'Placar incompleto ou inválido';
    return match.scoreA === draft.a && match.scoreB === draft.b ? 'Salvo automaticamente' : 'Atualizando placar';
  }

  finalScoreChanged(match: Match, field: 'a' | 'b' | 'tieBreakA' | 'tieBreakB', value: number | null): void {
    if (!this.canEditFinalScores || match.livePoints !== undefined || !match.teamA[0] || !match.teamB[0]) return;
    const draft = this.scoreDrafts[match.id] ?? {
      a: match.scoreA,
      b: match.scoreB,
      tieBreakA: match.tieBreakA ?? null,
      tieBreakB: match.tieBreakB ?? null,
    };
    draft[field] = value;
    if ((field === 'a' || field === 'b') && !(draft.a === 6 && draft.b === 6)) {
      draft.tieBreakA = null;
      draft.tieBreakB = null;
    }
    this.scoreDrafts[match.id] = draft;
    const hadWinner = this.finalsScheduler.winnerSide(match) !== null;
    match.scoreA = draft.a;
    match.scoreB = draft.b;
    match.tieBreakA = draft.tieBreakA ?? null;
    match.tieBreakB = draft.tieBreakB ?? null;
    this.state.finals = this.finalsScheduler.updatePodium(this.state.finals!);
    this.persist();
    if (!hadWinner && this.finalsScheduler.winnerSide(match) !== null) {
      this.analytics.capture('final_score_recorded', {
        final_kind: match.finalKind,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
      });
    }
  }

  async toggleFinalLiveScore(match: Match): Promise<void> {
    if (!this.canEditFinalScores || match.finalKind !== 'championship' || !match.teamA[0] || !match.teamB[0]) return;
    const active = match.livePoints !== undefined;
    if (
      (active ? !!match.livePoints?.length : match.scoreA !== null || match.scoreB !== null) &&
      !(await this.dialog.confirm({
        title: 'Alterar o modo de placar?',
        text: 'Isso apagará o resultado atual desta final.',
        confirmText: 'Alterar e apagar',
        tone: 'danger',
      }))
    )
      return;
    if (active) {
      delete match.livePoints;
      match.scoreA = null;
      match.scoreB = null;
      match.tieBreakA = null;
      match.tieBreakB = null;
    } else {
      match.livePoints = [];
      Object.assign(match, finalLiveMatchScore(calculateFinalLiveScore(match.livePoints)));
    }
    this.scoreDrafts[match.id] = {
      a: match.scoreA,
      b: match.scoreB,
      tieBreakA: match.tieBreakA,
      tieBreakB: match.tieBreakB,
    };
    if (this.state.finals) this.state.finals = this.finalsScheduler.updatePodium(this.state.finals);
    this.persist();
  }

  addFinalLivePoint(match: Match, point: FinalLivePoint): void {
    if (
      !this.canEditFinalScores ||
      match.finalKind !== 'championship' ||
      !match.teamA[0] ||
      !match.teamB[0] ||
      !match.livePoints ||
      match.livePoints.length >= MAX_FINAL_LIVE_POINTS
    )
      return;
    if (calculateFinalLiveScore(match.livePoints).winner) return;
    this.updateFinalLivePoints(match, [...match.livePoints, point]);
  }

  undoFinalLivePoint(match: Match): void {
    if (!this.canEditFinalScores || match.finalKind !== 'championship' || !match.livePoints?.length) return;
    this.updateFinalLivePoints(match, match.livePoints.slice(0, -1));
  }

  private updateFinalLivePoints(match: Match, points: FinalLivePoint[]): void {
    const hadWinner = this.finalsScheduler.winnerSide(match) !== null;
    match.livePoints = points;
    Object.assign(match, finalLiveMatchScore(calculateFinalLiveScore(points)));
    this.scoreDrafts[match.id] = {
      a: match.scoreA,
      b: match.scoreB,
      tieBreakA: match.tieBreakA,
      tieBreakB: match.tieBreakB,
    };
    if (this.state.finals) this.state.finals = this.finalsScheduler.updatePodium(this.state.finals);
    this.persist();
    if (!hadWinner && this.finalsScheduler.winnerSide(match) !== null) {
      this.analytics.capture('final_score_recorded', {
        final_kind: match.finalKind,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
      });
    }
  }

  async finalizeTournament(): Promise<void> {
    if (!this.canFinalizeTournament) return;
    if (
      !(await this.dialog.confirmTyped({
        title: 'Finalizar o torneio?',
        text: 'Depois disso nenhum resultado poderá ser alterado. Para confirmar, digite a palavra abaixo.',
        phrase: 'finalizar',
        confirmText: 'Finalizar torneio',
        tone: 'primary',
      }))
    ) {
      this.analytics.capture('tournament_finalize_cancelled', {
        tournament_mode: this.state.tournamentMode,
        hosting_mode: this.state.hostingMode,
      });
      return;
    }
    if (!this.canFinalizeTournament) return;
    const finishedAt = this.clock.iso();
    this.state.finishedAt = finishedAt;
    this.persist('Torneio finalizado.');
    this.setPage('settings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!this.isSharedMode) this.syncLocalTournamentMetrics();
    this.analytics.capture('tournament_finalized', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
      duration_seconds: this.state.startedAt
        ? Math.round((Date.parse(finishedAt) - Date.parse(this.state.startedAt)) / 1000)
        : undefined,
    });
    this.analytics.logInfo('tournament finalized', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
      has_started_at: !!this.state.startedAt,
    });
    void this.nps.open(true);
  }

  finalScoreStatus(match: Match): string {
    if (this.finalsScheduler.winnerSide(match)) return 'Resultado salvo';
    if (match.scoreA === 6 && match.scoreB === 6) return 'Tie-break: vencer por 2 pontos';
    if (match.scoreA === null || match.scoreB === null) return 'Informe os games do set';
    return 'Set em andamento · vitória por 2 games';
  }

  finalKindLabel(match: Match): string {
    return this.finalKindText(match.finalKind);
  }
  private finalKindText(kind: FinalMatchKind | undefined): string {
    return kind === 'quarterfinal'
      ? 'QUARTAS DE FINAL'
      : kind === 'semifinal'
        ? 'SEMIFINAL'
        : kind === 'championship'
          ? 'FINAL'
          : 'DISPUTA DE 3º LUGAR';
  }
  finalWinnerSide(match: Match): 1 | 2 | null {
    return this.finalsScheduler.winnerSide(match);
  }

  async clearScore(match: Match): Promise<void> {
    if (match.phase === 'final' ? !this.canEditFinalScores : !this.canEditRoundScores) return;
    if (
      !(await this.dialog.confirm({
        title: 'Remover o placar desta partida?',
        text: 'O ranking será recalculado.',
        confirmText: 'Remover placar',
        tone: 'danger',
      }))
    )
      return;
    match.scoreA = null;
    match.scoreB = null;
    match.tieBreakA = null;
    match.tieBreakB = null;
    this.scoreDrafts[match.id] = { a: null, b: null, tieBreakA: null, tieBreakB: null };
    if (match.phase === 'final' && this.state.finals)
      this.state.finals = this.finalsScheduler.updatePodium(this.state.finals);
    this.persist('Placar removido.');
  }

  selectRound(index: number): void {
    if (index < 0 || index >= this.state.rounds.length) return;
    this.selectedRound = index;
    window.setTimeout(() => {
      const tabs = document.querySelector<HTMLElement>('.round-tabs');
      const tab = document.getElementById(`round-tab-${index}`);
      if (!tabs || !tab) return;
      const offset =
        tab.getBoundingClientRect().left - tabs.getBoundingClientRect().left - (tabs.clientWidth - tab.clientWidth) / 2;
      tabs.scrollTo({
        left: tabs.scrollLeft + offset,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }, 0);
  }
  playerName(id: string): string {
    return this.state.players.find((p) => p.id === id)?.name ?? 'Jogador removido';
  }
  groupName(groupId: string): string {
    return this.state.groups?.find((group) => group.id === groupId)?.name ?? groupId;
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  isScored(match: Match): boolean {
    return isScored(match);
  }
  roundDone(index: number): boolean {
    return tournamentProgress.roundDone(this.state, index);
  }
  roundMatchesDone(index: number): number {
    return this.state.rounds[index]?.matches.filter((m) => this.isScored(m)).length ?? 0;
  }
  matchPending(match: Match): boolean {
    return !this.isScored(match);
  }

  async resetTournament(): Promise<void> {
    if (this.isSharedModerator && this.state.sharedTournamentId) {
      void this.cancelSharedTournament(true);
      return;
    }
    if (this.syncInFlight)
      return this.message('Aguarde a sincronização terminar antes de iniciar outro torneio.', 'error');
    if (!(await this.confirmDiscardPendingSync())) return;
    const kept = this.isSavedInLibrary();
    if (
      !(await this.dialog.confirm(
        kept
          ? {
              title: 'Iniciar um novo torneio?',
              text: 'O torneio atual continuará salvo em Meus torneios.',
              confirmText: 'Novo torneio',
            }
          : {
              title: 'Iniciar um novo torneio?',
              text: 'Isso apagará a tabela, os placares e os participantes salvos neste navegador.',
              confirmText: 'Apagar e começar',
              tone: 'danger',
            },
      ))
    )
      return;
    if (!this.isSharedMode) this.syncLocalTournamentMetrics(true);
    this.clearLocalTournament(true);
  }

  private syncLocalTournamentMetrics(abandoned = false): void {
    if (this.state.hostingMode === 'shared' || !this.state.startedAt) return;
    this.state.analyticsId ??= this.id();
    const snapshot = { ...this.state };
    void this.archive.recordLocalTournamentMetrics(snapshot, abandoned).catch(() => undefined);
  }

  async cancelSharedTournament(returnToLanding = false): Promise<void> {
    const id = this.state.sharedTournamentId;
    if (!this.isSharedModerator || !id) return;
    if (this.syncInFlight)
      return this.message('Aguarde a sincronização terminar antes de arquivar o torneio.', 'error');
    if (!(await this.confirmDiscardPendingSync())) return;
    if (
      !(await this.dialog.confirm({
        title: 'Arquivar este torneio e recomeçar?',
        text: 'O convite será invalidado. O histórico e os participantes serão preservados no dashboard.',
        confirmText: 'Arquivar e recomeçar',
        tone: 'danger',
      }))
    )
      return;
    if (await this.owned.cancel(id)) this.clearLocalTournament(returnToLanding);
  }

  private clearLocalTournament(returnToLanding = false): void {
    this.keepInLibrary(this.state);
    const target = this.syncTarget;
    try {
      if (target) this.syncQueue.remove(target.kind, target.id);
    } catch {
      this.syncError = 'Não foi possível limpar a fila local.';
    }
    this.storage.clearTournament();
    this.leaveSharedTournament();
    this.clearLocalLiveCredentials();
    this.syncError = '';
    this.state = newTournament(this.clock.iso());
    this.selectedRound = 0;
    this.setup.set(1);
    this.setPage('setup');
    this.savedTournaments.refresh();
    if (returnToLanding) this.openLanding();
    this.setup.viewed(1);
    this.message('Novo torneio iniciado.');
  }

  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 1_000_000)
      return this.message('O arquivo é grande demais para ser um backup do SETPOINT.', 'error');
    const imported = this.storage.parseTournament(await file.text());
    if (!imported) return this.message('Arquivo inválido: selecione um backup JSON exportado pelo SETPOINT.', 'error');
    if (!(await this.adoptTournament(imported, 'backup'))) return;
    this.analytics.capture('backup_imported', {
      tournament_mode: this.state.tournamentMode,
      tournament_size: this.state.size,
      has_schedule: this.hasSchedule,
      is_finalized: !!this.state.finishedAt,
    });
  }

  /** Replaces the tournament in the active slot with a backup file or a saved library entry. */
  private async adoptTournament(
    imported: TournamentState,
    origin: 'backup' | 'library',
    fromShared = false,
  ): Promise<boolean> {
    if (this.syncInFlight) {
      this.message('Aguarde a sincronização terminar antes de trocar de torneio.', 'error');
      return false;
    }
    if (!(await this.confirmDiscardPendingSync())) return false;
    const replacesWork =
      origin === 'backup'
        ? !!(this.state.players.length || this.state.rounds.length)
        : this.state.players.length > 0 && !this.isSavedInLibrary();
    if (
      replacesWork &&
      !(await this.dialog.confirm(
        origin === 'backup'
          ? {
              title: 'Importar este backup?',
              text: 'Ele substitui o torneio atual neste navegador.',
              confirmText: 'Importar backup',
              tone: 'danger',
            }
          : {
              title: 'Abrir outro torneio?',
              text: 'O torneio atual ainda não foi iniciado e não está salvo. Abrir outro descarta essa configuração.',
              confirmText: 'Abrir e descartar',
              tone: 'danger',
            },
      ))
    )
      return false;

    const previousTarget = this.syncTarget;
    if (
      previousTarget &&
      (this.hasPendingSync || previousTarget.kind !== 'local' || previousTarget.id !== imported.analyticsId)
    ) {
      try {
        this.syncQueue.remove(previousTarget.kind, previousTarget.id);
      } catch {
        this.message('Não foi possível atualizar a fila de sincronização.', 'error');
        return false;
      }
    }
    this.syncError = '';
    this.leaveSharedTournament();
    if (this.localLiveAnalyticsId && this.localLiveAnalyticsId !== imported.analyticsId)
      this.clearLocalLiveCredentials();
    delete imported.sharedTournamentId;
    delete imported.sharedStatus;
    this.state = {
      ...imported,
      hostingMode: 'local',
      analyticsId: imported.analyticsId ?? (imported.rounds.length ? this.id() : undefined),
      groups: imported.groups ?? [],
      fixedPairs: imported.fixedPairs ?? [],
      finals: imported.finals ?? null,
      tieBreakDraws: imported.tieBreakDraws ?? [],
    };
    this.restoreLocalLiveCredentials();
    this.selectedRound = 0;
    this.sharePlayerId = '';
    this.shareSession.message.set('');
    this.initializeScoreDrafts();
    // A local copy of a shared tournament is already stored on the server: do not archive or count it twice.
    this.persist(undefined, !fromShared);
    if (fromShared) this.keepInLibrary(this.state, true);
    this.savedTournaments.refresh();
    this.setPage(this.state.finals?.complete ? 'ranking' : this.state.rounds.length ? 'overview' : 'setup');
    if (origin === 'backup' && this.state.startedAt) this.syncLocalTournamentMetrics();
    this.message(
      this.state.finals?.complete
        ? 'Torneio finalizado carregado. Os dados estão em modo somente leitura.'
        : origin === 'backup'
          ? 'Backup carregado.'
          : 'Torneio salvo aberto.',
    );
    return true;
  }

  /** True when it is safe to go on: nothing pending, or the user chose to discard it. */
  private async confirmDiscardPendingSync(): Promise<boolean> {
    if (!this.hasPendingSync) return true;
    return this.dialog.confirm({
      title: 'Alterações ainda não sincronizadas',
      text: 'Exporte um backup antes de continuar. Se seguir agora, essas alterações serão descartadas.',
      confirmText: 'Descartar alterações',
      cancelText: 'Voltar',
      tone: 'danger',
    });
  }

  /** "Meus torneios", a lazy dialog. It opens a saved tournament through `openLibraryTournament`. */
  async openLibrary(): Promise<void> {
    if (this.libraryOpen) return;
    this.libraryOpen = true;
    try {
      const { LibraryDialogComponent: component, LIBRARY_TITLE_ID: labelledBy } =
        await import('./features/library/library-dialog.component');
      await this.dialog.open<void, LibraryDialogData, LibraryDialogComponent>(component, {
        data: { currentId: libraryId(this.state), open: (id) => this.openLibraryTournament(id) },
        labelledBy,
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-plain',
        sheetBelow: 620,
      });
    } catch {
      this.message('Não foi possível abrir os torneios salvos agora. Verifique a conexão e tente de novo.', 'error');
    } finally {
      this.libraryOpen = false;
    }
  }

  /** True when the saved tournament is now the one in use, so the list can close. */
  async openLibraryTournament(id: string): Promise<boolean> {
    const entry = this.library.get(id);
    const saved = this.library.load(id);
    if (!entry || !saved) {
      this.message('Não foi possível abrir este torneio salvo.', 'error');
      return false;
    }
    if (libraryId(this.state) === entry.id) {
      this.setPage(this.hasSchedule ? 'overview' : 'setup');
      return true;
    }
    if (!(await this.adoptTournament(saved, 'library', entry.hosting === 'shared'))) return false;
    window.scrollTo({ top: 0 });
    this.analytics.capture('tournament_library_opened_item', {
      phase: entry.phase,
      hosting_mode: entry.hosting,
    });
    return true;
  }

  private isSavedInLibrary(): boolean {
    try {
      const id = libraryId(this.state);
      return !!id && !!this.library.get(id);
    } catch {
      return false;
    }
  }

  /** Best-effort: the library is a safety net and must never break scoring. */
  private keepInLibrary(state: TournamentState, alreadyOnServer = false): void {
    try {
      if (state.hostingMode !== 'shared' && state.rounds.length && !state.analyticsId) state.analyticsId = this.id();
      const entry = this.library.save(state);
      if (entry && alreadyOnServer) this.library.markArchived(entry.id, entry.updatedAt);
    } catch {
      /* histórico é opcional */
    }
  }

  private archiveCurrent(): void {
    if (this.isDashboardRoute) return;
    this.keepInLibrary(this.state);
    this.savedTournaments.refresh();
    void this.flushArchives();
  }

  /** Uploads every unsent local tournament, in order. Retried on reconnect, on change and on launch. */
  private async flushArchives(): Promise<void> {
    if (
      this.archiveInFlight ||
      this.clock.now() < this.archiveRetryAfter ||
      !this.connectionOnline ||
      !this.auth.configured ||
      this.isSharedView ||
      this.isDashboardRoute
    )
      return;
    this.archiveInFlight = true;
    try {
      for (let pending = this.library.pendingArchives(); pending.length; pending = this.library.pendingArchives()) {
        const entry = pending[0];
        const saved = this.library.load(entry.id);
        if (saved) await this.archive.saveLocalTournamentArchive(entry.id, saved, this.storedLiveId(saved.analyticsId));
        // Keeps the flag when the entry changed mid-upload, so the next pass sends the newer copy.
        this.library.markArchived(entry.id, entry.updatedAt);
      }
    } catch {
      // Data stays on the device. Back off so a missing migration or an outage does not fire a request per score.
      this.archiveRetryAfter = this.clock.now() + 60_000;
    } finally {
      this.archiveInFlight = false;
    }
  }

  private storedLiveId(analyticsId?: string): string | undefined {
    if (!analyticsId) return undefined;
    try {
      const stored = this.local.getItem(`${LOCAL_LIVE_KEY}.${analyticsId}`);
      return stored ? (JSON.parse(stored) as { id?: string }).id : undefined;
    } catch {
      return undefined;
    }
  }

  private leaveSharedTournament(): void {
    this.owned.leave();
  }

  exportBackup(): void {
    exportTournamentBackup(this.state, this.clock, this.analytics);
    this.message('Backup JSON exportado.');
  }

  private initializeScoreDrafts(): void {
    this.scoreDrafts = {};
    for (const round of this.state.rounds)
      for (const match of round.matches) {
        this.scoreDrafts[match.id] = {
          a: match.scoreA,
          b: match.scoreB,
          tieBreakA: match.tieBreakA ?? null,
          tieBreakB: match.tieBreakB ?? null,
        };
      }
    for (const match of this.state.finals?.matches ?? []) {
      this.scoreDrafts[match.id] = {
        a: match.scoreA,
        b: match.scoreB,
        tieBreakA: match.tieBreakA ?? null,
        tieBreakB: match.tieBreakB ?? null,
      };
    }
  }

  private syncDefaultFixedPairs(): void {
    this.state.fixedPairs = tournamentFormat.defaultFixedPairs(this.state);
  }

  private normalizeGamesToWin(): void {
    if (!this.availableGamesToWin.includes(this.state.gamesToWin)) this.state.gamesToWin = 4;
  }

  private persist(success?: string, archive = true): void {
    const target = this.syncTarget;
    let queued = false;
    if (target && this.syncAvailable && (target.kind !== 'shared' || this.state.sharedStatus === 'active')) {
      try {
        queued = this.syncQueue.stage(target.kind, target.id, this.state);
        if (!queued) this.syncError = 'Sincronização não preparada. Exporte um backup e reconecte antes de continuar.';
      } catch {
        this.syncError = 'Não foi possível salvar a fila de sincronização. Exporte um backup deste torneio.';
      }
    }
    try {
      this.storage.saveTournament(this.state);
      if (success) this.message(success);
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Falha ao salvar.', 'error');
    }
    if (queued) {
      if (this.syncTimeout !== null) window.clearTimeout(this.syncTimeout);
      this.syncTimeout = window.setTimeout(() => {
        this.syncTimeout = null;
        void this.syncPending();
      }, 250);
    }
    if (archive) this.archiveCurrent();
  }
  private message(text: string, type: 'success' | 'error' = 'success'): void {
    this.notice = text;
    this.noticeType = type;
  }
  private clearNotice(): void {
    this.notice = '';
  }
  private id(): string {
    return this.random.uuid();
  }
}
