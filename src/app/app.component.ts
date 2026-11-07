import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DoublesFormat, LocalLiveTournamentSnapshot, Match, MixedFinalFormat, Page, Player, PlayerGender, PlayerStanding, SharedTournamentSnapshot, ThemeMode, TournamentGroup, TournamentMode, GroupFormat, TournamentHostingMode, TournamentSize, TournamentState } from './core/models';
import { StorageService } from './core/storage.service';
import { ScheduleService } from './core/schedule.service';
import { GroupScheduleService } from './core/group-schedule.service';
import { FinalsService, PodiumPlace } from './core/finals.service';
import { DashboardMetrics, SupabaseService } from './core/supabase.service';
import type { User } from '@supabase/supabase-js';
import { ShareCardLayout, ShareCardService, formatElapsed } from './core/share-card.service';
import { GroupStandingTable } from './features/ranking-view.component';
import { RankingViewComponent } from './features/ranking-view.component';
import { RoundNavigationComponent } from './features/round-navigation.component';
import { PlayerAvatarComponent } from './features/player-avatar.component';
import { AvatarPickerComponent } from './features/avatar-picker.component';
import { GenderToggleComponent } from './features/gender-toggle.component';
import { GenderIconComponent } from './features/gender-icon.component';
import { NumberRangeComponent } from './features/number-range.component';
import { PodiumComponent } from './features/podium.component';
import { GoalProjection, QualificationRow, QualificationService } from './core/qualification.service';
import { QualificationStatsComponent } from './features/qualification-stats.component';
import { PostHogService } from './core/posthog.service';
import { environment } from '../environments/environment';

interface BatchPlayerDraft { name: string; gender: PlayerGender | ''; error?: string; }

interface PlayerMatchDetail { phase: string; opponent: string; partner: string; score: string; result: string; }

interface GroupStandingEntry {
  label: string;
  playerIds: string[];
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  matchesPlayed: number;
}

const ACCESS_PASSWORD = 'bt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';
const LANDING_SEEN_KEY = 'setpoint.landing.seen';
const TUTORIAL_KEY = 'setpoint.tutorial.setup';
const SHARED_SETUP_KEY = 'setpoint.shared.setup';
const OWNER_INVITE_KEY = 'setpoint.shared.ownerInvite';
const LOCAL_LIVE_KEY = 'setpoint.local.live';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RankingViewComponent, RoundNavigationComponent, PlayerAvatarComponent, AvatarPickerComponent, GenderToggleComponent, PodiumComponent, QualificationStatsComponent, GenderIconComponent, NumberRangeComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly posthogService = inject(PostHogService);
  private readonly authCallback: boolean;

  isLocked = false;
  showLanding = false;
  tutorialEnabled = true;
  sitePassword = '';
  lockError = '';
  page: Page = 'setup';
  theme: ThemeMode = 'light';
  state: TournamentState;
  selectedRound = 0;
  setupStep = 1;
  newPlayerName = '';
  newPlayerGender: PlayerGender | '' = '';
  newPlayerAvatar = '';
  private standingsCacheSignature = '';
  private standingsCache: PlayerStanding[] = [];
  private standingsGroupCache: PlayerStanding[][] = [];
  private maleStandingsCache: PlayerStanding[] = [];
  private femaleStandingsCache: PlayerStanding[] = [];
  batchModalOpen = false;
  batchText = '';
  batchPlayers: BatchPlayerDraft[] = [];
  selectedRankingPlayerId = '';
  notice = '';
  noticeType: 'success' | 'error' = 'success';
  scoreDrafts: Record<string, { a: number | null; b: number | null; tieBreakA?: number | null; tieBreakB?: number | null }> = {};
  tieDrawModalOpen = false;
  activeTiePlayerIds: string[] = [];
  activeTieDrawResult: string[] = [];
  moderatorName = '';
  moderatorGender: PlayerGender | '' = '';
  moderatorAvatar = '';
  manualParticipantName = '';
  manualParticipantGender: PlayerGender | '' = '';
  manualParticipantAvatar = '';
  now = Date.now();
  private clockTimer: number | null = null;
  guestName = '';
  guestGender: PlayerGender | '' = '';
  guestAvatar = '';
  sharedLoading = false;
  sharedError = '';
  sharedNotice = '';
  isGuestView = false;
  isLiveViewer = false;
  isSharedModerator = false;
  sharedSnapshot: SharedTournamentSnapshot | null = null;
  sharedInviteToken = '';
  guestUpdateCount = 0;
  private firstGuestUpdateTargetId = '';
  sharePlayerId = '';
  sharingResults = false;
  shareMessage = '';
  sharePreviewOpen = false;
  sharePreviewLoading = false;
  sharePreviewUrl = '';
  sharePreviewBlob: Blob | null = null;
  shareLayout: ShareCardLayout = 'podium';
  shareBackgroundUrl = '';
  shareBackgroundName = '';
  private syncTimeout: number | null = null;
  private sharedPollTimer: number | null = null;
  private authStateUnsubscribe: (() => void) | null = null;
  private identifiedUserId: string | null = null;
  private sharedSignature = '';
  guestJoined = false;
  feedbackLoading = false;
  feedbackMessage = '';
  qualificationTargetPlace = 3;
  qualificationTargetPlayerId = '';
  qualificationModalOpen = false;
  isDashboardRoute = false;
  dashboardAuthenticated = false;
  dashboardEmail = '';
  dashboardMagicLinkSent = false;
  dashboardError = '';
  dashboardLoading = false;
  dashboardMetrics: DashboardMetrics | null = null;
  localLiveLoading = false;
  localLiveError = '';
  localLiveNotice = '';
  localLiveUrl = '';
  private localLiveReadToken = '';
  private localLiveWriteToken = '';
  private localLiveId = '';
  private localLiveAnalyticsId = '';
  private localLiveUpdateTimeout: number | null = null;
  private localLiveSignature = '';
  appBasePath = '';
  private readonly onPopState = (): void => this.restorePageFromPath();

  private readonly npsSurveyName = 'Net promoter score (NPS) (2026-11-01 20:44)';

  constructor(
    private storage: StorageService,
    private scheduler: ScheduleService,
    private groupScheduler: GroupScheduleService,
    private finalsScheduler: FinalsService,
    private supabase: SupabaseService,
    private shareCard: ShareCardService,
    private qualification: QualificationService
  ) {
    const inviteToken = new URLSearchParams(window.location.search).get('invite') ?? '';
    const liveToken = new URLSearchParams(window.location.search).get('live') ?? '';
    this.authCallback = new URLSearchParams(window.location.search).has('code')
      || window.location.hash.includes('access_token=');
    this.appBasePath = new URL(document.baseURI).pathname.replace(/\/+$/, '');
    this.isDashboardRoute = this.isDashboardPath(window.location.pathname);
    this.isLiveViewer = !!liveToken;
    this.isGuestView = !!inviteToken || this.isLiveViewer;
    this.sharedInviteToken = inviteToken;
    this.localLiveReadToken = liveToken;
    try {
      this.isLocked = environment.lockScreenEnabled && !this.isDashboardRoute && !this.isGuestView && !this.authCallback
        && sessionStorage.getItem(UNLOCK_SESSION_KEY) !== 'true';
    } catch {
      this.isLocked = environment.lockScreenEnabled && !this.isDashboardRoute && !this.isGuestView && !this.authCallback;
    }
    try { this.showLanding = !this.isDashboardRoute && !this.isGuestView && !this.authCallback && localStorage.getItem(LANDING_SEEN_KEY) !== 'true'; } catch { this.showLanding = false; }
    this.tutorialInit();
    this.state = this.storage.loadTournament() ?? {
      version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4,
      roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(),
      tournamentMode: 'super', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null
    };
    if (this.storage.clearCompletedTournamentOnVersionChange(this.buildId, this.state)) {
      this.state = {
        version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4,
        roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(),
        tournamentMode: 'super', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null
      };
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
    this.page = this.isDashboardRoute ? 'dashboard' : this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    if (!this.state.rounds.length) {
      if (!this.availableCourts.includes(this.state.courts)) this.state.courts = Math.floor(this.state.size / 4);
      this.state.roundCount = this.requiredRounds;
    }
    this.theme = this.storage.loadTheme();
    this.initializeScoreDrafts();
  }

  async ngOnInit(): Promise<void> {
    window.addEventListener('popstate', this.onPopState);
    this.applyTheme();
    // Os tokens do link mágico ficam no hash da URL; o PostHog só pode iniciar depois que saem dela.
    if (this.authCallback) await this.supabase.finishUrlSignIn();
    this.posthogService.init(environment.posthogKey, {
      api_host: environment.posthogHost,
      capture_exceptions: true,
      disable_capture_url_hashes: true,
      // O token do convite fica em ?invite= na URL; o PostHog envia <masked> no lugar dele.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['invite'],
      logs: {
        serviceName: 'setpoint-web',
        environment: environment.production ? 'production' : 'development',
      },
    });
    this.posthogService.logInfo('setpoint application initialized', {
      hosting_mode: this.state.hostingMode,
      is_guest_view: this.isGuestView,
    });
    this.posthogService.posthog.capture('app_opened', {
      view: this.page,
      hosting_mode: this.state.hostingMode,
      has_schedule: this.state.rounds.length > 0,
      is_guest_view: this.isGuestView,
    });
    this.trackFeatureViewed(this.page);
    if (this.page === 'setup') this.trackSetupStepViewed(this.setupStep);
    window.setTimeout(() => this.maybeStartSetupTour(), 600);
    this.authStateUnsubscribe = this.supabase.onAuthStateChange((event, user) => {
      if (event === 'SIGNED_IN' && user) {
        this.identifyUser(user);
        if (this.isDashboardRoute) {
          this.dashboardAuthenticated = true;
          void this.loadDashboardMetrics();
        }
      }
      if (event === 'SIGNED_OUT') {
        this.posthogService.posthog.reset();
        this.identifiedUserId = null;
        if (this.isDashboardRoute) {
          this.dashboardAuthenticated = false;
          this.dashboardMetrics = null;
        }
      }
    });
    void this.identifyCurrentUser();
    if (!this.isLocked && !this.isDashboardRoute && !this.isGuestView) this.backfillLocalTournamentMetrics();
    this.clockTimer = window.setInterval(() => { if (this.timerRunning) this.now = Date.now(); }, 1000);
    this.sharedPollTimer = window.setInterval(() => this.pollShared(), 4000);
    void this.restoreSharedFlow();
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.onPopState);
    if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
    if (this.sharedPollTimer !== null) window.clearInterval(this.sharedPollTimer);
    if (this.localLiveUpdateTimeout !== null) window.clearTimeout(this.localLiveUpdateTimeout);
    this.authStateUnsubscribe?.();
    if (this.sharePreviewUrl) URL.revokeObjectURL(this.sharePreviewUrl);
    if (this.shareBackgroundUrl) URL.revokeObjectURL(this.shareBackgroundUrl);
  }

  private async identifyCurrentUser(): Promise<void> {
    const user = await this.supabase.currentUser();
    if (user) {
      this.identifyUser(user);
      if (this.isDashboardRoute) {
        this.dashboardAuthenticated = true;
        void this.loadDashboardMetrics();
      }
    }
  }

  private identifyUser(user: User): void {
    if (this.identifiedUserId && this.identifiedUserId !== user.id) {
      this.posthogService.posthog.reset();
    }
    this.posthogService.posthog.identify(user.id);
    this.identifiedUserId = user.id;
  }

  get timerRunning(): boolean { return !!this.state.startedAt && !this.state.finishedAt; }
  get elapsedLabel(): string {
    if (!this.state.startedAt) return '—';
    const end = this.state.finishedAt ? Date.parse(this.state.finishedAt) : this.now;
    return formatElapsed(end - Date.parse(this.state.startedAt));
  }
  get roundsLocked(): boolean { return !!this.state.finals; }
  get finalsLocked(): boolean { return !!this.state.finishedAt; }
  get canFinalizeTournament(): boolean { return this.canEditScores && !!this.state.finals?.complete && !this.state.finishedAt; }
  get canEditRoundScores(): boolean { return this.canEditScores && !this.roundsLocked; }
  get canEditFinalScores(): boolean { return this.canEditScores && !this.finalsLocked; }
  get canManageParticipants(): boolean {
    return this.isSharedMode && this.isSharedModerator
      && (this.state.sharedStatus === 'registration' || this.state.sharedStatus === 'ready');
  }
  openPlayerMatches(playerId: string): void { this.selectedRankingPlayerId = playerId; }
  closePlayerMatches(): void { this.selectedRankingPlayerId = ''; }
  get selectedRankingPlayer(): Player | undefined { return this.state.players.find(player => player.id === this.selectedRankingPlayerId); }
  get selectedPlayerMatches(): PlayerMatchDetail[] {
    const playerId = this.selectedRankingPlayerId;
    if (!playerId) return [];
    const details: PlayerMatchDetail[] = [];
    const addMatch = (match: Match, phase: string) => {
      const onA = match.teamA.includes(playerId);
      const team = onA ? match.teamA : match.teamB;
      const opponents = onA ? match.teamB : match.teamA;
      const scoreFor = onA ? match.scoreA : match.scoreB;
      const scoreAgainst = onA ? match.scoreB : match.scoreA;
      details.push({ phase, partner: this.playerName(team.find(id => id !== playerId) ?? ''), opponent: opponents.map(id => this.playerName(id)).join(' + '), score: scoreFor === null || scoreAgainst === null ? 'Pendente' : scoreFor + '–' + scoreAgainst, result: scoreFor === null || scoreAgainst === null ? '' : scoreFor > scoreAgainst ? 'Vitória' : 'Derrota' });
    };
    this.state.rounds.forEach(round => round.matches.filter(match => match.teamA.includes(playerId) || match.teamB.includes(playerId)).forEach(match => addMatch(match, 'Rodada ' + round.number)));
    (this.state.finals?.matches ?? []).filter(match => match.teamA.includes(playerId) || match.teamB.includes(playerId)).forEach(match => addMatch(match, this.finalKindLabel(match)));
    return details;
  }

  placeOf(playerId: string): number { return this.shareCard.placementOf(this.state, this.standings, playerId); }
  get shareCandidates(): { playerId: string; name: string; place: number }[] {
    return this.state.players
      .map(player => ({ playerId: player.id, name: player.name, place: this.placeOf(player.id) }))
      .sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
  }
  trackByPlayerId(_: number, item: { playerId: string }): string { return item.playerId; }
  trackByMatchId(_: number, item: Match): string { return item.id; }
  get guestPlayerId(): string {
    const name = this.guestName.trim().toLowerCase();
    return this.state.players.find(player => player.name.trim().toLowerCase() === name)?.id ?? '';
  }
  get guestPlace(): number { return this.guestPlayerId ? this.placeOf(this.guestPlayerId) : 0; }
  playerPhoto(playerId: string): string { return this.state.players.find(player => player.id === playerId)?.photoDataUrl ?? ''; }
  isMe(playerId: string): boolean { return this.isGuestView && !!this.guestPlayerId && playerId === this.guestPlayerId; }
  shareMyResults(): void {
    this.sharePlayerId = this.guestPlayerId;
    void this.shareResults();
  }

  get sharedConfigured(): boolean { return this.supabase.isConfigured; }
  get posthogFeedbackEnabled(): boolean { return this.posthogService.isInitialized; }
  readonly buildId = window.__SETPOINT_CONFIG__?.buildId || 'dev';
  get isSharedMode(): boolean { return this.state.hostingMode === 'shared'; }
  get qualificationEnabled(): boolean {
    return !!this.state.qualificationStats && this.isSharedMode && !this.isGroupTournament
      && !this.state.finals && this.completedRounds >= 1;
  }
  get qualificationRows(): QualificationRow[] {
    return this.qualificationEnabled ? this.qualification.compute(this.state, this.standings) : [];
  }
  get qualificationPlayerId(): string {
    return this.isGuestView ? this.guestPlayerId
      : this.qualificationTargetPlayerId || this.standings[0]?.playerId || '';
  }
  get qualificationProjection(): GoalProjection | null {
    return this.qualificationEnabled && this.qualificationPlayerId
      ? this.qualification.projectGoal(this.state, this.standings, this.qualificationPlayerId, this.qualificationTargetPlace)
      : null;
  }
  setQualificationTargetPlayer(playerId: string): void { this.qualificationTargetPlayerId = playerId; }
  setQualificationTargetPlace(place: number): void { this.qualificationTargetPlace = place; }
  openQualificationStats(): void { this.qualificationModalOpen = true; }
  closeQualificationStats(): void { this.qualificationModalOpen = false; }
  setQualificationStats(enabled: boolean): void {
    if (this.hasSchedule) return;
    this.state.qualificationStats = enabled;
    this.persist();
  }

  async openNpsFeedback(centered = false): Promise<void> {
    if (this.feedbackLoading) return;
    this.feedbackLoading = true;
    this.feedbackMessage = '';
    try {
      const opened = await this.posthogService.displayApiSurveyByName(this.npsSurveyName, centered);
      if (!opened) {
        this.feedbackMessage = 'Pesquisa indisponível no momento.';
        return;
      }
      this.posthogService.posthog.capture('nps_feedback_opened', { survey: 'nps' });
    } catch {
      this.feedbackMessage = 'Não foi possível abrir a pesquisa.';
    } finally {
      this.feedbackLoading = false;
    }
  }
  get sharedReadOnly(): boolean { return this.isGuestView || (this.isSharedMode && !this.isSharedModerator); }
  get sharedInviteUrl(): string {
    if (!this.sharedInviteToken) return '';
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('invite', this.sharedInviteToken);
    return url.toString();
  }
  get sharedCapacityReached(): boolean { return this.state.players.length >= this.state.size; }
  get canJoinSharedTournament(): boolean {
    return !this.isLiveViewer && this.isGuestView && !!this.sharedSnapshot?.canJoin && !this.guestJoined;
  }
  get sharedStatusLabel(): string {
    if (this.isLiveViewer) {
      if (this.state.finishedAt) return 'Torneio finalizado';
      return this.state.rounds.length ? 'Acompanhando ao vivo' : 'Aguardando início';
    }
    switch (this.sharedSnapshot?.status) {
      case 'registration': return 'Inscrições abertas';
      case 'ready': return 'Vagas preenchidas · aguardando início';
      case 'active': return 'Torneio em andamento';
      case 'completed': return 'Torneio concluído';
      case 'archived': return 'Torneio arquivado';
      default: return 'Carregando torneio';
    }
  }

  enterApp(): void {
    try { localStorage.setItem(LANDING_SEEN_KEY, 'true'); } catch { /* landing volta na próxima visita */ }
    this.showLanding = false;
    window.scrollTo({ top: 0 });
    this.posthogService.posthog.capture('landing_cta_clicked');
    window.setTimeout(() => this.maybeStartSetupTour(), 400);
  }

  private maybeStartSetupTour(): void {
    if (this.isLocked || this.showLanding || this.isGuestView || this.isDashboardRoute) return;
    if (this.page !== 'setup' || this.setupStep !== 1) return;
    try { if (localStorage.getItem(TUTORIAL_KEY)) return; } catch { return; }
    void this.startSetupTour();
  }

  toggleTutorial(): void {
    this.tutorialEnabled = !this.tutorialEnabled;
    try {
      if (this.tutorialEnabled) localStorage.removeItem(TUTORIAL_KEY);
      else localStorage.setItem(TUTORIAL_KEY, 'off');
    } catch { /* sem persistência */ }
    this.posthogService.posthog.capture(this.tutorialEnabled ? 'tutorial_enabled' : 'tutorial_disabled');
  }

  async startSetupTour(): Promise<void> {
    if (this.page !== 'setup' || this.setupStep !== 1) return;
    const { driver } = await import('driver.js');
    const mark = (value: string) => { try { localStorage.setItem(TUTORIAL_KEY, value); } catch { /* sem persistência */ } };
    const steps = [
      { element: '#setupName', popover: { title: 'Nome do torneio', description: 'Dê um nome para identificar este torneio.' } },
      { element: '#hostingMode', popover: { title: 'Onde gerenciar', description: 'Local usa apenas este dispositivo. Compartilhado gera um link de convite com acompanhamento ao vivo.' } },
      { element: '#doublesFormat', popover: { title: 'Tipo de dupla', description: 'Abertas ou mistas (1 masculino + 1 feminino).' } },
      { element: '#tournamentMode', popover: { title: 'Formato', description: 'Super (duplas rotativas) ou Grupos.' } },
      { element: '#setupSize', popover: { title: 'Participantes', description: 'Escolha o número de jogadores; rodadas e quadras são calculadas automaticamente.' } },
      { element: '#setupNext', popover: { title: 'Próximo passo', description: 'Avance para inscrever os participantes e gerar a tabela.' } }
    ].filter(step => document.querySelector(step.element));
    if (!steps.length) return;
    let finished = false;
    const tour = driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: 'Concluir',
      progressText: '{{current}} de {{total}}',
      steps,
      onPopoverRender: popover => {
        const off = document.createElement('button');
        off.type = 'button';
        off.textContent = 'Desligar tutorial';
        off.className = 'tour-off';
        off.onclick = () => { finished = true; this.tutorialEnabled = false; mark('off'); this.posthogService.posthog.capture('tutorial_disabled'); tour.destroy(); };
        popover.footer.appendChild(off);
      },
      onDestroyed: () => {
        if (finished) return;
        finished = true;
        mark('done');
        this.posthogService.posthog.capture('tutorial_finished');
      }
    });
    this.posthogService.posthog.capture('tutorial_started');
    tour.drive();
  }

  private tutorialInit(): void {
    try { this.tutorialEnabled = localStorage.getItem(TUTORIAL_KEY) !== 'off'; } catch { /* mantém ligado */ }
  }

  handleBrandClick(): void {
    if (!this.state.startedAt) {
      this.openLanding();
      return;
    }
    this.navigate('overview');
  }

  openLanding(): void {
    this.showLanding = true;
    window.scrollTo({ top: 0 });
  }

  unlock(): void {
    if (this.sitePassword !== ACCESS_PASSWORD) {
      this.sitePassword = '';
      this.lockError = 'Senha incorreta. Tente novamente.';
      return;
    }
    try { sessionStorage.setItem(UNLOCK_SESSION_KEY, 'true'); } catch { /* desbloqueio vale até recarregar */ }
    this.isLocked = false;
    this.sitePassword = '';
    this.lockError = '';
    this.backfillLocalTournamentMetrics();
  }

  private backfillLocalTournamentMetrics(): void {
    if (this.state.hostingMode === 'shared' || !this.state.startedAt || !this.state.rounds.length) return;
    this.state.analyticsId ??= this.id();
    try { this.storage.saveTournament(this.state); } catch { return; }
    this.syncLocalTournamentMetrics();
  }

  async requestDashboardMagicLink(): Promise<void> {
    const email = this.dashboardEmail.trim();
    if (!email || this.dashboardLoading) return;
    this.dashboardLoading = true;
    this.dashboardError = '';
    this.dashboardMagicLinkSent = false;
    try {
      const redirect = new URL(document.baseURI);
      redirect.pathname = `${this.appBasePath}/dashboard`;
      redirect.search = '';
      redirect.hash = '';
      await this.supabase.requestModeratorLogin(email, redirect.toString());
      this.dashboardMagicLinkSent = true;
    } catch (error) {
      this.dashboardError = error instanceof Error ? error.message : 'Não foi possível enviar o link de acesso.';
    } finally {
      this.dashboardLoading = false;
    }
  }

  async loadDashboardMetrics(): Promise<void> {
    if (this.dashboardLoading) return;
    this.dashboardLoading = true;
    this.dashboardError = '';
    try {
      this.dashboardMetrics = await this.supabase.getDashboardMetrics();
    } catch {
      this.dashboardError = 'Acesso não autorizado ou métricas indisponíveis. Entre com uma conta moderadora autorizada.';
    } finally {
      this.dashboardLoading = false;
    }
  }

  formatDashboardDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    const totalMinutes = Math.round(Math.max(0, seconds) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
  }

  formatCompletionRate(rate: number | null): string { return `${(rate ?? 0).toFixed(1)}%`; }

  scrollGuestTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openFirstGuestUpdate(): void {
    const target = document.getElementById(this.firstGuestUpdateTargetId);
    target?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
    this.guestUpdateCount = 0;
    this.firstGuestUpdateTargetId = '';
  }

  private guestUpdateTarget(previous: TournamentState, next: TournamentState): string {
    if ((!previous.finals && next.finals) || (!previous.finishedAt && next.finishedAt)) return 'guest-finals';
    if (JSON.stringify(previous.players) !== JSON.stringify(next.players)) return 'guest-participants';
    if (JSON.stringify(previous.rounds) !== JSON.stringify(next.rounds)) return 'guest-rounds';
    return next.rounds.length ? 'guest-ranking' : 'guest-participants';
  }

  get hasSchedule(): boolean { return this.state.rounds.length > 0; }
  get canEditScores(): boolean {
    return !this.isGuestView && (!this.isSharedMode
      || (this.isSharedModerator && this.state.sharedStatus === 'active'));
  }
  get hasFinals(): boolean { return !!this.state.finals; }
  get usesMixedFinals(): boolean { return this.isEarlyFinalsOptionAvailable && !!this.state.earlyFinalsEnabled; }
  get usesMixedFinalBracket(): boolean { return this.usesMixedFinals && (this.state.mixedFinalFormat ?? 'knockout') === 'knockout'; }
  get mixedFinalistCount(): number { return this.usesMixedFinalBracket ? 8 : 4; }
  get maleStandings(): PlayerStanding[] { this.refreshStandingsCache(); return this.maleStandingsCache; }
  get femaleStandings(): PlayerStanding[] { this.refreshStandingsCache(); return this.femaleStandingsCache; }
  get isEarlyFinalsOptionAvailable(): boolean {
    return !this.isGroupTournament && this.state.size === 24 && this.isMixedDoubles && this.state.courts === 3;
  }
  get earlyFinalsReady(): boolean {
    if (!this.state.earlyFinalsEnabled || !this.isEarlyFinalsOptionAvailable) return false;
    const matchCounts = this.standings.map(row => row.matchesPlayed);
    return matchCounts.length > 0 && matchCounts[0] > 0 && matchCounts.every(count => count === matchCounts[0]);
  }
  get canGenerateFinal(): boolean {
    const scheduleComplete = this.state.rounds.every(round => round.matches.every(match => this.isScored(match)));
    return this.canEditScores && this.hasSchedule && !this.hasFinals && this.state.players.length >= 8
      && (scheduleComplete || this.earlyFinalsReady);
  }
  get finalPodium(): PodiumPlace[] {
    return this.state.finals ? this.finalsScheduler.podium(this.state.finals) : [];
  }
  get unresolvedFinalTiePlayers(): PlayerStanding[] {
    let position = 0;
    for (const tiedPlayers of this.rankedStandingGroups()) {
      if (tiedPlayers.length > 1 && position < 8 && !this.hasStoredTieDraw(tiedPlayers)) return tiedPlayers;
      position += tiedPlayers.length;
    }
    return [];
  }
  get activeTiePositionLabel(): string {
    const positions = this.activeTiePlayerIds.map(id => this.standings.findIndex(row => row.playerId === id) + 1)
      .sort((a, b) => a - b);
    return positions.length ? positions.map(position => `${position}º`).join(' e ') : '';
  }
  get isGroupTournament(): boolean { return this.state.tournamentMode === 'groups'; }
  get isMixedDoubles(): boolean { return this.state.doublesFormat === 'mixed'; }
  get fixedPairsMode(): boolean { return this.isGroupTournament && this.state.groupFormat === 'fixed'; }
  get availableGamesToWin(): number[] {
    return this.isGroupTournament ? [4, 5, 6] : [3, 4, 5, 6];
  }
  get availableSizes(): TournamentSize[] { return this.isGroupTournament ? [8, 12, 24] : [8, 10, 12, 24]; }
  get availableCourts(): number[] {
    if (this.isGroupTournament) return [this.state.size / 4];
    if (this.state.size === 24) return this.isMixedDoubles ? [6, 3] : [6];
    return this.state.size === 12 ? [2, 3] : [2];
  }
  get requiredRounds(): number {
    if (this.isGroupTournament) return this.fixedPairsMode ? this.state.size / 2 - 1 : this.isMixedDoubles ? 2 : 3;
    if (this.state.size === 24 && this.state.courts === 3) return 46;
    if (this.state.size === 10) return 10;
    if (this.state.size === 12 && this.state.courts === 2) return 12;
    return this.state.size - 1;
  }
  get requiredCourts(): number { return this.state.courts; }
  get currentRound() { return this.state.rounds[this.selectedRound] ?? null; }
  get totalMatches(): number {
    return this.state.rounds.reduce((sum, round) => sum + round.matches.length, 0)
      + (this.state.finals?.matches.length ?? 0);
  }
  get completedMatches(): number {
    const roundMatches = this.state.rounds.reduce((sum, round) => sum + round.matches.filter(match => this.isScored(match)).length, 0);
    const finalMatches = (this.state.finals?.matches ?? []).filter(match => this.finalWinnerSide(match) !== null).length;
    return roundMatches + finalMatches;
  }
  get completedRounds(): number { return this.state.rounds.filter(r => r.matches.every(m => this.isScored(m))).length; }
  get progress(): number { return this.totalMatches ? Math.round(this.completedMatches / this.totalMatches * 100) : 0; }
  get groupTables(): GroupStandingTable[] {
    const standings = new Map(this.standings.map(row => [row.playerId, row]));
    return (this.state.groups ?? []).map(group => {
      const entries = this.fixedPairsMode && group.fixedPairs
        ? group.fixedPairs.map(pair => this.toGroupStandingEntry(pair, standings))
        : group.playerIds.map(playerId => this.toGroupStandingEntry([playerId], standings));
      entries.sort((a, b) => b.setsWon - a.setsWon || b.gameBalance - a.gameBalance
        || b.gamesFor - a.gamesFor || a.label.localeCompare(b.label));
      return { id: group.id, name: group.name, entries };
    });
  }

  private toGroupStandingEntry(
    playerIds: string[], standings: Map<string, PlayerStanding>
  ): GroupStandingEntry {
    const players = playerIds.map(id => this.state.players.find(player => player.id === id));
    const standing = standings.get(playerIds[0]);
    if (!standing || players.some(player => !player)) throw new Error('Jogador não encontrado no ranking do grupo.');
    return {
      label: players.map(player => player!.name).join(' + '),
      playerIds,
      setsWon: standing.setsWon,
      gamesFor: standing.gamesFor,
      gamesAgainst: standing.gamesAgainst,
      gameBalance: standing.gameBalance,
      matchesPlayed: standing.matchesPlayed
    };
  }
  get standings(): PlayerStanding[] { this.refreshStandingsCache(); return this.standingsCache; }

  private refreshStandingsCache(): void {
    const signature = [
      this.state.players.map(player => player.id + ':' + player.name + ':' + (player.gender ?? '')).join('|'),
      this.state.rounds.map(round => round.matches.map(match => match.id + ':' + match.scoreA + ':' + match.scoreB).join(',')).join('|'),
      (this.state.tieBreakDraws ?? []).map(draw => draw.playerIds.join(',') + ':' + draw.order.join(',')).join('|')
    ].join('~');
    if (signature === this.standingsCacheSignature) return;
    this.standingsGroupCache = this.computeRankedStandingGroups();
    this.standingsCache = this.standingsGroupCache.flat();
    const genderByPlayerId = new Map(this.state.players.map(player => [player.id, player.gender]));
    this.maleStandingsCache = this.standingsCache.filter(row => genderByPlayerId.get(row.playerId) === 'male');
    this.femaleStandingsCache = this.standingsCache.filter(row => genderByPlayerId.get(row.playerId) === 'female');
    this.standingsCacheSignature = signature;
  }

  private buildStandings(): PlayerStanding[] {
    const rows = this.state.players.map(player => ({
      playerId: player.id, name: player.name, setsWon: 0, gamesFor: 0,
      gamesAgainst: 0, gameBalance: 0, rests: this.state.rounds.filter(r => r.restingPlayerIds.includes(player.id)).length,
      matchesPlayed: 0
    }));
    const byId = new Map<string, PlayerStanding>();
    rows.forEach(row => byId.set(row.playerId, row));
    for (const round of this.state.rounds) for (const match of round.matches) {
      if (!this.isScored(match)) continue;
      const a = match.scoreA!; const b = match.scoreB!;
      for (const id of match.teamA) {
        const row = byId.get(id); if (!row) continue;
        row.gamesFor += a; row.gamesAgainst += b; row.matchesPlayed++;
        if (a > b) row.setsWon++;
      }
      for (const id of match.teamB) {
        const row = byId.get(id); if (!row) continue;
        row.gamesFor += b; row.gamesAgainst += a; row.matchesPlayed++;
        if (b > a) row.setsWon++;
      }
    }
    return rows.map(row => ({ ...row, gameBalance: row.gamesFor - row.gamesAgainst }));
  }

  private rankedStandingGroups(): PlayerStanding[][] { this.refreshStandingsCache(); return this.standingsGroupCache; }

  private computeRankedStandingGroups(): PlayerStanding[][] {
    const rows = this.buildStandings().sort((a, b) => this.compareStandingCriteria(a, b) || a.name.localeCompare(b.name));
    const criteriaGroups: PlayerStanding[][] = [];
    for (const row of rows) {
      const current = criteriaGroups[criteriaGroups.length - 1];
      if (current && this.compareStandingCriteria(current[0], row) === 0) current.push(row);
      else criteriaGroups.push([row]);
    }

    const rankedGroups: PlayerStanding[][] = [];
    for (const criteriaGroup of criteriaGroups) {
      if (criteriaGroup.length === 1) {
        rankedGroups.push(criteriaGroup);
        continue;
      }
      const withHeadToHead = criteriaGroup.map(row => ({
        row,
        wins: this.directWinsAgainstTiedPlayers(row.playerId, criteriaGroup)
      })).sort((a, b) => b.wins - a.wins || a.row.name.localeCompare(b.row.name));
      const headToHeadGroups: Array<{ wins: number; players: PlayerStanding[] }> = [];
      for (const item of withHeadToHead) {
        const current = headToHeadGroups[headToHeadGroups.length - 1];
        if (current && current.wins === item.wins) current.players.push(item.row);
        else headToHeadGroups.push({ wins: item.wins, players: [item.row] });
      }
      for (const tiedPlayers of headToHeadGroups) {
        const drawOrder = this.storedTieDrawOrder(tiedPlayers.players);
        rankedGroups.push(drawOrder
          ? [...tiedPlayers.players].sort((a, b) => drawOrder.indexOf(a.playerId) - drawOrder.indexOf(b.playerId))
          : tiedPlayers.players);
      }
    }
    return rankedGroups;
  }

  private compareStandingCriteria(a: PlayerStanding, b: PlayerStanding): number {
    return b.setsWon - a.setsWon || b.gameBalance - a.gameBalance || b.gamesFor - a.gamesFor;
  }

  private directWinsAgainstTiedPlayers(playerId: string, tiedPlayers: PlayerStanding[]): number {
    const tiedIds = new Set(tiedPlayers.map(player => player.playerId).filter(id => id !== playerId));
    let wins = 0;
    for (const round of this.state.rounds) for (const match of round.matches) {
      if (!this.isScored(match)) continue;
      const playerOnA = match.teamA.includes(playerId);
      if (!playerOnA && !match.teamB.includes(playerId)) continue;
      const opponents = playerOnA ? match.teamB : match.teamA;
      const directOpponentCount = opponents.filter(id => tiedIds.has(id)).length;
      if (!directOpponentCount) continue;
      const playerSideWon = playerOnA ? match.scoreA! > match.scoreB! : match.scoreB! > match.scoreA!;
      if (playerSideWon) wins += directOpponentCount;
    }
    return wins;
  }

  private storedTieDrawOrder(players: PlayerStanding[]): string[] | null {
    const playerIds = players.map(player => player.playerId).sort();
    return this.state.tieBreakDraws?.find(draw => draw.playerIds.length === playerIds.length
      && [...draw.playerIds].sort().every((id, index) => id === playerIds[index]))?.order ?? null;
  }

  private hasStoredTieDraw(players: PlayerStanding[]): boolean {
    return this.storedTieDrawOrder(players) !== null;
  }

  navigate(page: Page): void { this.setPage(page); this.clearNotice(); }

  private setPage(page: Page): void {
    if (this.page === page && (page !== 'dashboard' || this.isDashboardRoute)) return;
    if (page === 'dashboard') {
      this.isDashboardRoute = true;
      window.history.pushState({}, '', `${this.appBasePath}/dashboard`);
      if (this.dashboardAuthenticated) void this.loadDashboardMetrics();
    } else if (this.isDashboardRoute) {
      this.isDashboardRoute = false;
      window.history.pushState({}, '', `${this.appBasePath}/`);
    }
    this.page = page;
    this.trackFeatureViewed(page);
  }

  private isDashboardPath(path: string): boolean { return path.replace(/\/+$/, '').endsWith('/dashboard'); }

  private restorePageFromPath(): void {
    const dashboard = this.isDashboardPath(window.location.pathname);
    if (dashboard === this.isDashboardRoute) return;
    this.isDashboardRoute = dashboard;
    if (dashboard) {
      this.page = 'dashboard';
      void this.identifyCurrentUser();
    } else {
      this.page = this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    }
  }

  private trackFeatureViewed(page: Page): void {
    this.posthogService.posthog.capture('feature_viewed', {
      feature: page === 'rounds' ? 'matches' : page,
      hosting_mode: this.state.hostingMode,
      is_guest_view: this.isGuestView,
    });
  }

  private trackSetupStepViewed(step: number): void {
    this.posthogService.posthog.capture('tournament_setup_step_viewed', {
      step,
      hosting_mode: this.state.hostingMode,
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      tournament_size: this.state.size,
    });
  }

  private trackSetupStepCompleted(step: number): void {
    this.posthogService.posthog.capture('tournament_setup_step_completed', {
      step,
      hosting_mode: this.state.hostingMode,
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      tournament_size: this.state.size,
    });
  }
  toggleTheme(): void {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    this.storage.saveTheme(this.theme); this.applyTheme();
  }
  private applyTheme(): void { document.documentElement.dataset['theme'] = this.theme; }

  addPlayer(): void {
    const name = this.newPlayerName.trim();
    if (!name) return;
    if (this.isMixedDoubles && !this.newPlayerGender) return this.message('Selecione a categoria do atleta para formar as duplas mistas.', 'error');
    if (this.hasSchedule) return this.message('A lista está bloqueada porque a tabela já foi gerada.', 'error');
    if (this.isSharedMode) return this.message('No torneio compartilhado, os participantes entram pelo link de convite.', 'error');
    if (this.state.players.length >= this.state.size) return this.message(`O Super ${this.state.size} permite ${this.state.size} jogadores.`, 'error');
    if (this.state.players.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return this.message('Já existe um participante com esse nome.', 'error');
    this.state.players.push({
      id: this.id(), name,
      ...(this.isMixedDoubles && this.newPlayerGender ? { gender: this.newPlayerGender } : {}),
      ...(this.newPlayerAvatar ? { photoDataUrl: this.newPlayerAvatar } : {})
    });
    this.syncDefaultFixedPairs();
    this.newPlayerName = ''; this.newPlayerGender = ''; this.newPlayerAvatar = ''; this.persist();
    this.posthogService.posthog.capture('player_added', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
    });
  }

  openBatchModal(): void {
    this.batchModalOpen = true;
    this.batchText = '';
    this.batchPlayers = [];
  }

  parseBatchPlayers(): void {
    const genderOf = (value: string): PlayerGender | '' => {
      const normalized = value.trim().toLowerCase();
      return ['m', 'masculino', 'male'].includes(normalized) ? 'male'
        : ['f', 'feminino', 'female'].includes(normalized) ? 'female' : '';
    };
    this.batchPlayers = this.batchText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/[\t,;]/).map(part => part.trim());
      const last = parts.length > 1 ? genderOf(parts[parts.length - 1]) : '';
      return { name: last ? parts.slice(0, -1).join(' ').trim() : parts[0], gender: last };
    });
    this.validateBatchPlayers();
  }

  validateBatchPlayers(): void {
    const names = new Set(this.state.players.map(player => player.name.trim().toLocaleLowerCase()));
    const remaining = this.state.size - this.state.players.length;
    this.batchPlayers.forEach((player, index) => {
      const name = player.name.trim();
      const key = name.toLocaleLowerCase();
      player.error = !name ? 'Informe o nome.'
        : names.has(key) ? 'Nome duplicado.'
        : this.isMixedDoubles && !player.gender ? 'Selecione a categoria.'
        : index >= remaining ? 'Sem vaga disponível.' : '';
      names.add(key);
    });
  }

  get canConfirmBatchPlayers(): boolean { return this.batchPlayers.length > 0 && this.batchPlayers.every(player => !player.error); }

  confirmBatchPlayers(): void {
    this.validateBatchPlayers();
    if (!this.canConfirmBatchPlayers) return;
    this.state.players.push(...this.batchPlayers.map(player => ({
      id: this.id(), name: player.name.trim(),
      ...(this.isMixedDoubles ? { gender: player.gender as PlayerGender } : {})
    })));
    this.syncDefaultFixedPairs();
    this.batchModalOpen = false;
    this.batchText = '';
    this.batchPlayers = [];
    this.persist('Participantes adicionados em lote.');
  }

  removePlayer(id: string): void {
    if (this.hasSchedule) return;
    if (this.isSharedMode) return this.message('Não é possível remover participantes do torneio compartilhado.', 'error');
    this.state.players = this.state.players.filter(p => p.id !== id);
    this.syncDefaultFixedPairs();
    this.persist();
  }

  updatePlayerGender(playerId: string, gender: PlayerGender | ''): void {
    if (this.hasSchedule || !this.isMixedDoubles) return;
    const player = this.state.players.find(item => item.id === playerId);
    if (!player) return;
    if (gender) player.gender = gender;
    else delete player.gender;
    this.syncDefaultFixedPairs();
    this.persist();
  }

  saveSettings(): void {
    if (this.hasSchedule) return this.message('As configurações ficam bloqueadas depois da geração da tabela.', 'error');
    this.state.name = this.state.name.trim() || 'Meu torneio';
    if (this.state.players.length > this.state.size) return this.message(`Remova participantes até ficar com ${this.state.size}.`, 'error');
    this.state.roundCount = this.requiredRounds;
    this.state.courts = this.requiredCourts;
    this.persist('Configurações salvas.');
    this.posthogService.posthog.capture('tournament_settings_saved', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      court_count: this.state.courts,
      games_to_win: this.state.gamesToWin,
    });
  }

  changeSize(size: number): void {
    if (!this.availableSizes.includes(size as TournamentSize)) return;
    this.state.size = size as TournamentSize;
    this.state.courts = this.availableCourts[0];
    this.normalizeGamesToWin();
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
  }

  changeCourts(courts: number): void {
    if (!this.availableCourts.includes(courts)) return;
    this.state.courts = courts;
    if (!this.isEarlyFinalsOptionAvailable) this.state.earlyFinalsEnabled = false;
    this.state.roundCount = this.requiredRounds;
  }

  setEarlyFinals(enabled: boolean): void {
    if (this.hasSchedule || !this.isEarlyFinalsOptionAvailable) return;
    this.state.earlyFinalsEnabled = enabled;
    this.state.mixedFinalFormat ??= 'knockout';
    this.persist();
  }

  setMixedFinalFormat(format: MixedFinalFormat): void {
    if (this.hasSchedule || !this.isEarlyFinalsOptionAvailable) return;
    this.state.mixedFinalFormat = format;
    this.persist();
  }

  changeTournamentMode(mode: TournamentMode): void {
    this.state.tournamentMode = mode;
    if (!this.availableSizes.includes(this.state.size)) this.state.size = 8;
    this.state.courts = this.availableCourts[0];
    this.normalizeGamesToWin();
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
  }

  changeDoublesFormat(format: DoublesFormat): void {
    if (this.hasSchedule) return;
    this.state.doublesFormat = format;
    if (!this.availableCourts.includes(this.state.courts)) this.state.courts = this.availableCourts[0];
    if (!this.isEarlyFinalsOptionAvailable) this.state.earlyFinalsEnabled = false;
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
    this.persist();
  }

  changeHostingMode(mode: TournamentHostingMode): void {
    if (this.hasSchedule || (mode === 'shared' && !this.sharedConfigured)) return;
    this.state.hostingMode = mode;
    this.state.qualificationStats = mode === 'shared' ? (this.state.qualificationStats ?? true) : false;
    this.sharedError = '';
    this.sharedNotice = '';
    this.persist();
  }

  changeGroupFormat(format: GroupFormat): void {
    this.state.groupFormat = format;
    this.state.courts = this.availableCourts[0];
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
  }

  fixedPairOptions(pairIndex: number): Player[] {
    return this.state.fixedPairs?.[pairIndex] ? this.state.players : [];
  }

  updateFixedPair(pairIndex: number, side: 0 | 1, playerId: string): void {
    const pairs = (this.state.fixedPairs ?? []).map(pair => [...pair] as [string, string]);
    if (!pairs[pairIndex]) return;
    const previousPlayerId = pairs[pairIndex][side];
    const otherPairIndex = pairs.findIndex((pair, index) => index !== pairIndex && pair.includes(playerId));
    if (otherPairIndex >= 0) {
      const otherSide = pairs[otherPairIndex].findIndex(id => id === playerId) as 0 | 1;
      pairs[otherPairIndex][otherSide] = previousPlayerId;
    }
    pairs[pairIndex][side] = playerId;
    if (this.isMixedDoubles && pairs.some(pair => {
      const firstGender = this.state.players.find(player => player.id === pair[0])?.gender;
      const secondGender = this.state.players.find(player => player.id === pair[1])?.gender;
      return !firstGender || !secondGender || firstGender === secondGender;
    })) {
      this.message('Cada dupla precisa ter um atleta masculino e um feminino.', 'error');
      return;
    }
    this.state.fixedPairs = pairs;
    this.persist();
  }

  nextSetupStep(): void {
    if (this.setupStep === 1) {
      if (this.isSharedMode) {
        void this.requestSharedTournamentLogin();
        return;
      }
      this.state.name = this.state.name.trim() || 'Meu torneio';
      this.state.roundCount = this.requiredRounds;
      this.state.courts = this.requiredCourts;
      this.persist();
      this.setupStep = 2;
      this.trackSetupStepCompleted(1);
      this.trackSetupStepViewed(2);
      return;
    }
    if (this.state.players.length !== this.state.size) {
      return this.message(`Cadastre exatamente ${this.state.size} jogadores para continuar.`, 'error');
    }
    this.setupStep = 3;
    this.trackSetupStepCompleted(2);
    this.trackSetupStepViewed(3);
    this.clearNotice();
  }

  async requestSharedTournamentLogin(): Promise<void> {
    if (!this.sharedConfigured) return this.message('O modo compartilhado ainda não está configurado neste deploy.', 'error');
    if (!this.moderatorName.trim()) return this.message('Informe seu nome para entrar como moderador.', 'error');
    if (this.isMixedDoubles && !this.moderatorGender) return this.message('Selecione sua categoria para entrar no torneio misto.', 'error');
    if (this.isMixedDoubles && !this.moderatorGender) return this.message('Selecione sua categoria para entrar no torneio misto.', 'error');
    if (this.state.players.length || this.state.rounds.length) {
      return this.message('Para compartilhar, comece com um torneio sem lista local. Os participantes entrarão pelo convite.', 'error');
    }
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      this.state.hostingMode = 'shared';
      this.state.name = this.state.name.trim() || 'Meu torneio';
      this.state.roundCount = this.requiredRounds;
      this.state.courts = this.requiredCourts;
      const user = await this.supabase.currentUser();
      const reusableSession = !!user;
      if (reusableSession) {
        await this.createSharedTournamentOnServer();
        return;
      }
      await this.supabase.signInAnonymously();
      await this.createSharedTournamentOnServer();
    } catch (error) {
      this.sharedError = this.moderatorAuthErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  private moderatorAuthErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/anonymous/i.test(message)) {
      return 'O login sem e-mail está desativado no Supabase. Ative "Allow anonymous sign-ins" ou escolha o link por e-mail.';
    }
    return message || 'Não foi possível entrar como moderador.';
  }

  async addManualParticipant(): Promise<void> {
    const name = this.manualParticipantName.trim();
    if (!name || !this.canManageParticipants || !this.state.sharedTournamentId) return;
    if (this.isMixedDoubles && !this.manualParticipantGender) {
      this.sharedError = 'Selecione a categoria do atleta para formar as duplas mistas.';
      return;
    }
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      this.applySharedSnapshot(await this.supabase.addSharedParticipant(this.state.sharedTournamentId, name, this.manualParticipantGender || 'male', this.manualParticipantAvatar || undefined), true);
      this.manualParticipantName = '';
      this.manualParticipantGender = '';
      this.manualParticipantAvatar = '';
      this.posthogService.posthog.capture('shared_participant_added_manually', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
        participant_count: this.state.players.length,
      });
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  async removeManualParticipant(playerId: string): Promise<void> {
    if (!this.canManageParticipants || !this.state.sharedTournamentId) return;
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      this.applySharedSnapshot(await this.supabase.removeSharedParticipant(this.state.sharedTournamentId, playerId), true);
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  async joinSharedTournament(): Promise<void> {
    const name = this.guestName.trim();
    if (!this.sharedInviteToken || !name) return;
    if (this.isMixedDoubles && !this.guestGender) {
      this.sharedError = 'Selecione sua categoria para entrar no torneio misto.';
      return;
    }
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      const snapshot = await this.supabase.joinSharedTournament(this.sharedInviteToken, name, this.guestGender || 'male', this.guestAvatar || undefined);
      this.guestName = name;
      this.guestJoined = true;
      this.isGuestView = true;
      this.isSharedModerator = false;
      this.applySharedSnapshot(snapshot);
      this.subscribeToShared(snapshot.id, false);
      this.posthogService.posthog.capture('shared_tournament_joined', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
        participant_count: this.state.players.length,
      });
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  async copySharedInvite(): Promise<void> {
    if (!this.sharedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.sharedInviteUrl);
      this.sharedNotice = 'Link copiado.';
      this.posthogService.posthog.capture('shared_invite_copied', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
      });
    } catch {
      this.sharedError = 'Não foi possível copiar. Selecione e copie o link manualmente.';
    }
  }

  async createOrCopyLocalLiveLink(): Promise<void> {
    if (this.state.finishedAt) return;
    if (this.localLiveReadToken) return this.copyLocalLiveLink();
    if (!this.supabase.isConfigured) {
      this.localLiveError = 'A publicação ao vivo não está configurada neste deploy.';
      return;
    }
    this.localLiveLoading = true;
    this.localLiveError = '';
    this.localLiveNotice = '';
    try {
      this.state.analyticsId ??= this.id();
      const credentials = await this.supabase.createLocalLiveTournament(this.state);
      this.localLiveId = credentials.id;
      this.localLiveReadToken = credentials.readToken;
      this.localLiveWriteToken = credentials.writeToken;
      this.localLiveAnalyticsId = this.state.analyticsId;
      this.localLiveUrl = this.createLocalLiveUrl(credentials.readToken);
      localStorage.setItem(`${LOCAL_LIVE_KEY}.${this.state.analyticsId}`, JSON.stringify(credentials));
      this.storage.saveTournament(this.state);
      this.posthogService.posthog.capture('local_live_link_created');
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
      this.posthogService.posthog.capture('local_live_link_copied');
    } catch {
      this.localLiveError = 'Não foi possível copiar. Selecione e copie o link manualmente.';
    }
  }

  private createLocalLiveUrl(token: string): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('live', token);
    return url.toString();
  }

  private restoreLocalLiveCredentials(): void {
    if (!this.state.analyticsId || this.state.hostingMode === 'shared') return;
    try {
      const stored = localStorage.getItem(`${LOCAL_LIVE_KEY}.${this.state.analyticsId}`);
      if (!stored) return;
      const credentials = JSON.parse(stored) as { id?: string; readToken?: string; writeToken?: string };
      if (!credentials.id || !credentials.readToken || !credentials.writeToken) return;
      this.localLiveId = credentials.id;
      this.localLiveReadToken = credentials.readToken;
      this.localLiveWriteToken = credentials.writeToken;
      this.localLiveAnalyticsId = this.state.analyticsId;
      this.localLiveUrl = this.createLocalLiveUrl(credentials.readToken);
    } catch { /* link remains unavailable if browser storage is blocked */ }
  }

  private clearLocalLiveCredentials(): void {
    try {
      if (this.localLiveAnalyticsId) localStorage.removeItem(`${LOCAL_LIVE_KEY}.${this.localLiveAnalyticsId}`);
    } catch { /* sem armazenamento local */ }
    this.localLiveReadToken = '';
    this.localLiveWriteToken = '';
    this.localLiveId = '';
    this.localLiveAnalyticsId = '';
    this.localLiveUrl = '';
    this.localLiveNotice = '';
  }

  async renewSharedInvite(): Promise<void> {
    if (!this.isSharedModerator || !this.state.sharedTournamentId) return;
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      const invite = await this.supabase.rotateSharedInvite(this.state.sharedTournamentId);
      this.sharedInviteToken = invite.inviteToken;
      this.saveOwnerInvite(this.state.sharedTournamentId, invite.inviteToken);
      this.sharedSnapshot = this.sharedSnapshot
        ? { ...this.sharedSnapshot, inviteExpiresAt: invite.inviteExpiresAt }
        : this.sharedSnapshot;
      this.sharedNotice = 'Novo link de convite criado. O link anterior foi invalidado.';
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  async shareResults(): Promise<void> {
    if (!this.state.finals?.complete || !this.sharePlayerId) return;
    this.sharePreviewOpen = true;
    await this.refreshSharePreview();
  }

  async refreshSharePreview(): Promise<void> {
    if (!this.state.finals?.complete || !this.sharePlayerId) return;
    this.sharingResults = true;
    this.sharePreviewLoading = true;
    this.shareMessage = '';
    this.sharePreviewBlob = null;
    if (this.sharePreviewUrl) URL.revokeObjectURL(this.sharePreviewUrl);
    this.sharePreviewUrl = '';
    try {
      this.sharePreviewBlob = await this.shareCard.generatePlayerResultsImage(
        this.state,
        this.standings,
        this.sharePlayerId,
        { layout: this.shareLayout, backgroundImageUrl: this.shareBackgroundUrl || undefined }
      );
      this.sharePreviewUrl = URL.createObjectURL(this.sharePreviewBlob);
    } catch (error) {
      this.shareMessage = error instanceof Error ? error.message : 'Não foi possível gerar a prévia.';
    } finally {
      this.sharingResults = false;
      this.sharePreviewLoading = false;
    }
  }

  async chooseShareLayout(layout: ShareCardLayout): Promise<void> {
    if (this.shareLayout === layout) return;
    this.shareLayout = layout;
    if (this.sharePreviewOpen) await this.refreshSharePreview();
  }

  async selectShareBackground(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.shareMessage = 'Escolha um arquivo de imagem.';
      return;
    }
    if (file.size > 8_000_000) {
      this.shareMessage = 'A imagem deve ter até 8 MB.';
      return;
    }
    if (this.shareBackgroundUrl) URL.revokeObjectURL(this.shareBackgroundUrl);
    this.shareBackgroundUrl = URL.createObjectURL(file);
    this.shareBackgroundName = file.name;
    if (this.sharePreviewOpen) await this.refreshSharePreview();
  }

  async clearShareBackground(): Promise<void> {
    if (this.shareBackgroundUrl) URL.revokeObjectURL(this.shareBackgroundUrl);
    this.shareBackgroundUrl = '';
    this.shareBackgroundName = '';
    if (this.sharePreviewOpen) await this.refreshSharePreview();
  }

  closeSharePreview(): void { this.sharePreviewOpen = false; }

  downloadSharePreview(): void {
    if (!this.sharePreviewBlob || !this.sharePlayerId) return;
    const player = this.state.players.find(item => item.id === this.sharePlayerId);
    if (!player) return;
    this.shareCard.downloadImage(this.sharePreviewBlob, player.name);
    this.shareMessage = 'Imagem baixada.';
    this.posthogService.posthog.capture('results_shared', {
      share_method: 'downloaded',
      share_layout: this.shareLayout,
      has_custom_background: !!this.shareBackgroundUrl,
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      tournament_size: this.state.size,
    });
  }

  async sharePreviewImage(): Promise<void> {
    if (!this.sharePreviewBlob || !this.sharePlayerId) return;
    const player = this.state.players.find(item => item.id === this.sharePlayerId);
    if (!player) return;
    try {
      const shared = await this.shareCard.shareImage(this.sharePreviewBlob, player.name, this.state.name);
      if (!shared) {
        this.downloadSharePreview();
        return;
      }
      this.shareMessage = 'Imagem compartilhada.';
      this.posthogService.posthog.capture('results_shared', {
        share_method: 'shared',
        share_layout: this.shareLayout,
        has_custom_background: !!this.shareBackgroundUrl,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.shareMessage = error instanceof Error ? error.message : 'Não foi possível compartilhar a imagem.';
    }
  }

  private async restoreSharedFlow(): Promise<void> {
    if (this.isLiveViewer) {
      if (!this.supabase.isConfigured) {
        this.sharedError = 'O acompanhamento ao vivo não está configurado neste deploy.';
        return;
      }
      try {
        const snapshot = await this.supabase.getLocalLiveTournament(this.localLiveReadToken);
        this.applyLocalLiveSnapshot(snapshot);
        this.supabase.subscribeToLocalLiveTournament(snapshot.id, () => { void this.refreshLocalLiveState(); });
      } catch (error) {
        this.sharedError = this.sharedErrorMessage(error);
      }
      return;
    }
    if (!this.supabase.isConfigured) {
      if (this.sharedInviteToken) this.sharedError = 'O modo compartilhado não está configurado neste deploy.';
      return;
    }
    if (this.sharedInviteToken) {
      this.isLocked = false;
      this.setPage('shared');
      this.guestName = await this.supabase.getGuestName(this.sharedInviteToken);
      try {
        let snapshot = await this.supabase.getSharedTournament(this.sharedInviteToken);
        if (this.guestName) { snapshot = await this.supabase.joinSharedTournament(this.sharedInviteToken, this.guestName); this.guestJoined = true; }
        this.isGuestView = true;
        this.isSharedModerator = false;
        this.applySharedSnapshot(snapshot);
        this.subscribeToShared(snapshot.id, false);
      } catch (error) {
        this.sharedError = this.sharedErrorMessage(error);
      }
      return;
    }

    localStorage.removeItem(SHARED_SETUP_KEY);
    sessionStorage.removeItem(SHARED_SETUP_KEY);

    if (this.state.hostingMode === 'shared' && this.state.sharedTournamentId && await this.supabase.currentUser()) {
      try {
        const snapshot = await this.supabase.getOwnedSharedTournament(this.state.sharedTournamentId);
        this.isSharedModerator = true;
        this.sharedInviteToken = this.loadOwnerInvite(snapshot.id);
        this.applySharedSnapshot(snapshot);
        if (!snapshot.state.rounds?.length) {
          this.setPage('setup');
          this.setupStep = 2;
          this.trackSetupStepViewed(2);
        }
        this.subscribeToShared(snapshot.id, true);
      } catch (error) {
        this.sharedError = this.sharedErrorMessage(error);
      }
    }
  }

  private async createSharedTournamentOnServer(): Promise<void> {
    try {
      const draft = { ...this.state, hostingMode: 'shared' as const, players: [], rounds: [], groups: [], fixedPairs: [], finals: null };
      const snapshot = await this.supabase.createSharedTournament(draft, this.moderatorName.trim(), this.moderatorGender || 'male', this.moderatorAvatar || undefined);
      localStorage.removeItem(SHARED_SETUP_KEY);
      sessionStorage.removeItem(SHARED_SETUP_KEY);
      this.isSharedModerator = true;
      this.isGuestView = false;
      this.sharedInviteToken = snapshot.inviteToken ?? '';
      if (this.sharedInviteToken) this.saveOwnerInvite(snapshot.id, this.sharedInviteToken);
      this.applySharedSnapshot(snapshot);
      this.setupStep = 2;
      this.persist();
      this.subscribeToShared(snapshot.id, true);
      this.sharedNotice = 'Torneio compartilhado criado. Envie o convite para preencher as vagas.';
      this.trackSetupStepCompleted(1);
      this.trackSetupStepViewed(2);
      this.posthogService.posthog.capture('tournament_created', {
        hosting_mode: 'shared',
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
      });
      this.posthogService.posthog.capture('shared_tournament_created', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
        moderator_auth_mode: 'anonymous',
      });
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  private applySharedSnapshot(snapshot: SharedTournamentSnapshot, keepView = false): void {
    const hadPreviousSnapshot = this.sharedSnapshot !== null;
    const wasFinished = !!this.sharedSnapshot?.state.finishedAt;
    this.sharedSnapshot = snapshot;
    this.sharedSignature = JSON.stringify([snapshot.status, snapshot.state]);
    this.state = {
      ...snapshot.state,
      hostingMode: 'shared',
      sharedTournamentId: snapshot.id,
      sharedStatus: snapshot.status,
      tournamentMode: snapshot.state.tournamentMode ?? 'super',
      groupFormat: snapshot.state.groupFormat ?? 'rotating',
      groups: snapshot.state.groups ?? [],
      fixedPairs: snapshot.state.fixedPairs ?? [],
      finals: snapshot.state.finals ?? null,
      tieBreakDraws: snapshot.state.tieBreakDraws ?? []
    };
    if (this.fixedPairsMode && this.state.players.length === this.state.size
      && this.state.fixedPairs?.length !== this.state.size / 2) this.syncDefaultFixedPairs();
    this.state.roundCount = snapshot.state.roundCount;
    if (!keepView) this.setPage(this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup');
    this.initializeScoreDrafts();
    if (this.isGuestView && !this.isLiveViewer && hadPreviousSnapshot && !wasFinished && snapshot.state.finishedAt) {
      window.setTimeout(() => { void this.openNpsFeedback(true); }, 0);
    }
  }

  private applyLocalLiveSnapshot(snapshot: LocalLiveTournamentSnapshot): void {
    const sharedStatus: SharedTournamentSnapshot['status'] = snapshot.status === 'completed'
      ? 'completed'
      : snapshot.state.rounds.length ? 'active' : 'registration';
    const viewSnapshot: SharedTournamentSnapshot = {
      id: snapshot.id,
      status: sharedStatus,
      capacity: snapshot.state.size,
      state: snapshot.state,
      inviteExpiresAt: '',
      expiresAt: null,
      canJoin: false
    };
    this.isGuestView = true;
    this.isLiveViewer = true;
    this.isSharedModerator = false;
    this.applySharedSnapshot(viewSnapshot, true);
    this.state.hostingMode = 'local';
    this.localLiveSignature = JSON.stringify([snapshot.status, snapshot.state]);
  }

  private async refreshLocalLiveState(): Promise<void> {
    if (!this.localLiveReadToken || this.sharedLoading || document.hidden) return;
    try {
      const snapshot = await this.supabase.getLocalLiveTournament(this.localLiveReadToken);
      const signature = JSON.stringify([snapshot.status, snapshot.state]);
      if (signature === this.localLiveSignature) return;
      const updateTarget = this.guestUpdateTarget(this.state, snapshot.state);
      this.applyLocalLiveSnapshot(snapshot);
      if (this.guestUpdateCount === 0) this.firstGuestUpdateTargetId = updateTarget;
      this.guestUpdateCount++;
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  private subscribeToShared(id: string, owner: boolean): void {
    this.supabase.subscribeToSharedTournament(id, () => { void this.refreshSharedState(id, owner); });
  }

  private async refreshSharedState(id: string, owner: boolean): Promise<void> {
    try {
      const snapshot = owner
        ? await this.supabase.getOwnedSharedTournament(id)
        : await this.supabase.getSharedTournament(this.sharedInviteToken);
      if (JSON.stringify([snapshot.status, snapshot.state]) === this.sharedSignature) return;
      if (owner && this.state.rounds.length) return;
      const updateTarget = !owner ? this.guestUpdateTarget(this.state, snapshot.state) : '';
      this.applySharedSnapshot(snapshot, true);
      if (!owner) {
        if (this.guestUpdateCount === 0) this.firstGuestUpdateTargetId = updateTarget;
        this.guestUpdateCount++;
      }
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  // Garante a atualização mesmo quando o Realtime não entrega o aviso.
  private pollShared(): void {
    if (document.hidden || this.sharedLoading) return;
    if (this.isLiveViewer) {
      if (this.sharedSnapshot?.status !== 'completed') void this.refreshLocalLiveState();
      return;
    }
    if (this.isGuestView) {
      if (this.sharedSnapshot && this.sharedSnapshot.status !== 'completed' && this.sharedSnapshot.status !== 'archived') {
        void this.refreshSharedState(this.sharedSnapshot.id, false);
      }
    } else if (this.isSharedModerator && this.state.sharedTournamentId && !this.state.rounds.length) {
      void this.refreshSharedState(this.state.sharedTournamentId, true);
    }
  }

  private saveOwnerInvite(id: string, token: string): void {
    try { localStorage.setItem(`${OWNER_INVITE_KEY}.${id}`, token); } catch { /* sem armazenamento local */ }
  }

  private loadOwnerInvite(id: string): string {
    try { return localStorage.getItem(`${OWNER_INVITE_KEY}.${id}`) ?? ''; } catch { return ''; }
  }

  private sharedErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('invalid_live_link')) return 'Este link de acompanhamento não é válido.';
    if (message.includes('authentication_required')) return 'Não foi possível autenticar a publicação. Tente novamente.';
    if (message.includes('tournament_completed')) return 'O torneio já foi finalizado e não pode mais ser atualizado.';
    if (message.includes('registration_closed') || message.includes('invite_expired')) return 'Este convite expirou ou as inscrições foram encerradas.';
    if (message.includes('tournament_full')) return 'As vagas deste torneio já foram preenchidas.';
    if (message.includes('tournament_expired')) return 'Este torneio compartilhado já expirou.';
    if (message.includes('participant_not_removable')) return 'Só é possível remover participantes adicionados manualmente.';
    if (message.includes('rounds_locked')) return 'As rodadas ficam bloqueadas depois que as finais são geradas.';
    if (message.includes('invalid_invite')) return 'Este link de convite não é válido.';
    return message || 'Não foi possível acessar o torneio compartilhado.';
  }

  previousSetupStep(): void {
    if (this.setupStep > 1) this.setupStep--;
    this.clearNotice();
  }

  async generateSchedule(): Promise<void> {
    if (this.state.players.length !== this.state.size) {
      return this.message(`Cadastre exatamente ${this.state.size} jogadores. Atualmente: ${this.state.players.length}.`, 'error');
    }
    if (this.hasSchedule) return this.message('A tabela já foi gerada.');
    if (this.isSharedMode && (!this.isSharedModerator || this.state.sharedStatus !== 'ready')) {
      return this.message('O torneio compartilhado só pode iniciar pelo moderador quando todas as vagas estiverem preenchidas.', 'error');
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
          this.isMixedDoubles
        );
        this.state.groups = schedule.groups;
        this.state.rounds = schedule.rounds;
      } else {
        this.state.groups = [];
        this.state.rounds = this.scheduler.generate(this.state.players, this.state.size, this.state.courts, this.state.roundCount, this.isMixedDoubles);
      }
      if (this.isSharedMode && this.state.sharedTournamentId) {
        this.state.startedAt = new Date().toISOString();
        const snapshot = await this.supabase.startSharedTournament(this.state.sharedTournamentId, this.state);
        this.applySharedSnapshot(snapshot);
      }
      this.state.startedAt ??= new Date().toISOString();
      if (!this.isSharedMode) this.state.analyticsId ??= this.id();
      this.now = Date.now();
      this.selectedRound = 0; this.initializeScoreDrafts(); this.persist('Todas as rodadas foram geradas e salvas.'); this.setPage('rounds');
      if (!this.isSharedMode) this.syncLocalTournamentMetrics();
      this.trackSetupStepCompleted(3);
      if (!this.isSharedMode) {
        this.posthogService.posthog.capture('tournament_created', {
          hosting_mode: this.state.hostingMode,
          tournament_mode: this.state.tournamentMode,
          doubles_format: this.state.doublesFormat ?? 'open',
          tournament_size: this.state.size,
        });
      }
      this.posthogService.posthog.capture('tournament_started', {
        hosting_mode: this.state.hostingMode,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
      });
      this.posthogService.posthog.capture('schedule_generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        hosting_mode: this.state.hostingMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
        court_count: this.state.courts,
      });
      this.posthogService.logInfo('tournament schedule generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        hosting_mode: this.state.hostingMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
        court_count: this.state.courts,
      });
    } catch (error) {
      if (this.isSharedMode) {
        this.state.rounds = previousRounds;
        this.state.groups = previousGroups;
      }
      this.message(error instanceof Error ? error.message : 'Erro ao gerar a tabela.', 'error');
    }
  }

  generateFinal(): void {
    if (!this.canGenerateFinal) return this.message('Conclua todas as partidas da fase atual para gerar a final.', 'error');
    const unresolvedTie = this.unresolvedFinalTiePlayers;
    if (unresolvedTie.length) {
      this.activeTiePlayerIds = unresolvedTie.map(player => player.playerId);
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
      const swapIndex = this.secureRandomIndex(index + 1);
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    this.state.tieBreakDraws ??= [];
    this.state.tieBreakDraws.push({
      playerIds: [...this.activeTiePlayerIds].sort(),
      order,
      createdAt: new Date().toISOString()
    });
    this.activeTieDrawResult = order;
    this.persist('Sorteio registrado; a classificação foi atualizada.');
  }

  confirmTieDraw(): void {
    if (!this.activeTieDrawResult.length) return;
    const unresolvedTie = this.unresolvedFinalTiePlayers;
    if (unresolvedTie.length) {
      this.activeTiePlayerIds = unresolvedTie.map(player => player.playerId);
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
      this.persist(this.usesMixedFinalBracket ? 'Chave mista gerada com os oito melhores de cada categoria.' : this.usesMixedFinals ? 'Finais diretas geradas com os quatro melhores de cada categoria.' : 'Finais geradas com base nos oito primeiros do ranking.');
      this.posthogService.posthog.capture('finals_generated', {
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
        tournament_size: this.state.size,
      });
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'Não foi possível gerar a final.', 'error');
    }
  }

  private secureRandomIndex(max: number): number {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.getRandomValues) return Math.floor(Math.random() * max);
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / max) * max;
    const sample = new Uint32Array(1);
    do { cryptoApi.getRandomValues(sample); } while (sample[0] >= limit);
    return sample[0] % max;
  }

  scoreChanged(match: Match, side: 'a' | 'b', value: number | null): void {
    if (!this.canEditRoundScores) return;
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    draft[side] = value;
    this.scoreDrafts[match.id] = draft;
    const a = draft.a; const b = draft.b;
    if (a === null || b === null || !Number.isInteger(a) || !Number.isInteger(b)
      || a < 0 || b < 0 || a > this.state.gamesToWin || b > this.state.gamesToWin || a === b
      || Math.max(a, b) !== this.state.gamesToWin) return;
    if (match.scoreA === a && match.scoreB === b) return;
    match.scoreA = a; match.scoreB = b;
    this.scoreDrafts[match.id] = { a, b };
    this.persist();
    this.posthogService.posthog.capture('match_score_recorded', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      round_number: this.selectedRound + 1,
      match_phase: match.phase ?? (this.isGroupTournament ? 'groups' : 'super'),
    });
  }

  scoreStatus(match: Match): string {
    const draft = this.scoreDrafts[match.id];
    if (!draft || draft.a === null || draft.b === null) return 'Preencha os dois placares';
    const valid = Number.isInteger(draft.a) && Number.isInteger(draft.b)
      && draft.a >= 0 && draft.b >= 0 && draft.a <= this.state.gamesToWin
      && draft.b <= this.state.gamesToWin && draft.a !== draft.b
      && Math.max(draft.a, draft.b) === this.state.gamesToWin;
    if (!valid) return 'Placar incompleto ou inválido';
    return match.scoreA === draft.a && match.scoreB === draft.b
      ? 'Salvo automaticamente' : 'Atualizando placar';
  }

  finalScoreChanged(
    match: Match, field: 'a' | 'b' | 'tieBreakA' | 'tieBreakB', value: number | null
  ): void {
    if (!this.canEditFinalScores || !match.teamA[0] || !match.teamB[0]) return;
    const draft = this.scoreDrafts[match.id] ?? {
      a: match.scoreA,
      b: match.scoreB,
      tieBreakA: match.tieBreakA ?? null,
      tieBreakB: match.tieBreakB ?? null
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
      this.posthogService.posthog.capture('final_score_recorded', {
        final_kind: match.finalKind,
        tournament_mode: this.state.tournamentMode,
        doubles_format: this.state.doublesFormat ?? 'open',
      });
    }
  }

  finalizeTournament(): void {
    if (!this.canFinalizeTournament) return;
    if (!confirm('Finalizar o torneio? Depois disso nenhum resultado poderá ser alterado.')) return;
    const finishedAt = new Date().toISOString();
    this.state.finishedAt = finishedAt;
    this.persist('Torneio finalizado.');
    this.setPage('settings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!this.isSharedMode) this.syncLocalTournamentMetrics();
    this.posthogService.posthog.capture('tournament_finalized', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
      duration_seconds: this.state.startedAt
        ? Math.round((Date.parse(finishedAt) - Date.parse(this.state.startedAt)) / 1000)
        : undefined,
    });
    this.posthogService.logInfo('tournament finalized', {
      tournament_mode: this.state.tournamentMode,
      doubles_format: this.state.doublesFormat ?? 'open',
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
      has_started_at: !!this.state.startedAt,
    });
    void this.openNpsFeedback(true);
  }

  finalScoreStatus(match: Match): string {
    if (this.finalsScheduler.winnerSide(match)) return 'Resultado salvo';
    if (match.scoreA === 6 && match.scoreB === 6) return 'Tie-break: vencer por 2 pontos';
    if (match.scoreA === null || match.scoreB === null) return 'Informe os games do set';
    return 'Set em andamento · vitória por 2 games';
  }

  finalKindLabel(match: Match): string { return match.finalKind === 'quarterfinal' ? 'QUARTAS DE FINAL' : match.finalKind === 'semifinal' ? 'SEMIFINAL' : match.finalKind === 'championship' ? 'FINAL' : 'DISPUTA DE 3º LUGAR'; }
  finalWinnerSide(match: Match): 1 | 2 | null {
    return this.finalsScheduler.winnerSide(match);
  }

  clearScore(match: Match): void {
    if (match.phase === 'final' ? !this.canEditFinalScores : !this.canEditRoundScores) return;
    if (!confirm('Remover o placar desta partida? O ranking será recalculado.')) return;
    match.scoreA = null; match.scoreB = null; match.tieBreakA = null; match.tieBreakB = null;
    this.scoreDrafts[match.id] = { a: null, b: null, tieBreakA: null, tieBreakB: null };
    if (match.phase === 'final' && this.state.finals) this.state.finals = this.finalsScheduler.updatePodium(this.state.finals);
    this.persist('Placar removido.');
  }

  selectRound(index: number): void {
    if (index < 0 || index >= this.state.rounds.length) return;
    this.selectedRound = index;
    window.setTimeout(() => {
      const tabs = document.querySelector<HTMLElement>('.round-tabs');
      const tab = document.getElementById(`round-tab-${index}`);
      if (!tabs || !tab) return;
      const offset = tab.getBoundingClientRect().left - tabs.getBoundingClientRect().left
        - (tabs.clientWidth - tab.clientWidth) / 2;
      tabs.scrollTo({
        left: tabs.scrollLeft + offset,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }, 0);
  }
  playerName(id: string): string { return this.state.players.find(p => p.id === id)?.name ?? 'Jogador removido'; }
  groupName(groupId: string): string { return this.state.groups?.find(group => group.id === groupId)?.name ?? groupId; }
  initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
  isScored(match: Match): boolean { return match.scoreA !== null && match.scoreB !== null; }
  roundDone(index: number): boolean { return this.state.rounds[index]?.matches.every(m => this.isScored(m)) ?? false; }
  roundMatchesDone(index: number): number { return this.state.rounds[index]?.matches.filter(m => this.isScored(m)).length ?? 0; }
  matchPending(match: Match): boolean { return !this.isScored(match); }

  resetTournament(): void {
    if (this.isSharedModerator && this.state.sharedTournamentId) { void this.cancelSharedTournament(true); return; }
    if (!confirm('Isso apagará a tabela, os placares e os participantes salvos neste navegador. Deseja continuar?')) return;
    if (!this.isSharedMode) this.syncLocalTournamentMetrics(true);
    this.clearLocalTournament(true);
  }

  private syncLocalTournamentMetrics(abandoned = false): void {
    if (this.state.hostingMode === 'shared' || !this.state.startedAt) return;
    this.state.analyticsId ??= this.id();
    const snapshot = { ...this.state };
    void this.supabase.recordLocalTournamentMetrics(snapshot, abandoned).catch(() => undefined);
  }

  async cancelSharedTournament(returnToLanding = false): Promise<void> {
    const id = this.state.sharedTournamentId;
    if (!this.isSharedModerator || !id) return;
    if (!confirm('Arquivar este torneio e recomeçar? O convite será invalidado. O histórico e os participantes serão preservados no dashboard.')) return;
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      await this.supabase.cancelSharedTournament(id);
      this.clearLocalTournament(returnToLanding);
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  private clearLocalTournament(returnToLanding = false): void {
    this.storage.clearTournament();
    this.leaveSharedTournament();
    this.clearLocalLiveCredentials();
    this.state = { version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4, roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(), tournamentMode: 'super', hostingMode: 'local', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null };
    this.selectedRound = 0; this.setupStep = 1; this.selectedRankingPlayerId = ''; this.setPage('setup');
    if (returnToLanding) this.openLanding();
    this.trackSetupStepViewed(1); this.message('Novo torneio iniciado.');
  }

  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 1_000_000) return this.message('O arquivo é grande demais para ser um backup do SETPOINT.', 'error');
    const imported = this.storage.parseTournament(await file.text());
    if (!imported) return this.message('Arquivo inválido: selecione um backup JSON exportado pelo SETPOINT.', 'error');
    if ((this.state.players.length || this.state.rounds.length)
      && !confirm('Importar este backup substitui o torneio atual neste navegador. Deseja continuar?')) return;

    this.leaveSharedTournament();
    if (this.localLiveAnalyticsId && this.localLiveAnalyticsId !== imported.analyticsId) this.clearLocalLiveCredentials();
    delete imported.sharedTournamentId;
    delete imported.sharedStatus;
    this.state = {
      ...imported,
      hostingMode: 'local',
      analyticsId: imported.analyticsId ?? (imported.rounds.length ? this.id() : undefined),
      groups: imported.groups ?? [],
      fixedPairs: imported.fixedPairs ?? [],
      finals: imported.finals ?? null,
      tieBreakDraws: imported.tieBreakDraws ?? []
    };
    this.restoreLocalLiveCredentials();
    this.selectedRound = 0;
    this.sharePlayerId = '';
    this.shareMessage = '';
    this.initializeScoreDrafts();
    this.persist();
    this.setPage(this.state.finals?.complete ? 'ranking' : this.state.rounds.length ? 'overview' : 'setup');
    if (this.state.startedAt) this.syncLocalTournamentMetrics();
    this.message(this.state.finals?.complete
      ? 'Torneio finalizado carregado. Os dados estão em modo somente leitura.'
      : 'Backup carregado.');
    this.posthogService.posthog.capture('backup_imported', {
      tournament_mode: this.state.tournamentMode,
      tournament_size: this.state.size,
      has_schedule: this.hasSchedule,
      is_finalized: !!this.state.finishedAt,
    });
  }

  private leaveSharedTournament(): void {
    if (this.state.sharedTournamentId) this.supabase.unsubscribeFromSharedTournament(this.state.sharedTournamentId);
    this.isSharedModerator = false;
    this.sharedSnapshot = null;
    this.sharedInviteToken = '';
    this.sharedError = '';
    this.sharedNotice = '';
    try { if (this.state.sharedTournamentId) localStorage.removeItem(`${OWNER_INVITE_KEY}.${this.state.sharedTournamentId}`); } catch { /* sem armazenamento local */ }
  }

  exportBackup(): void {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `setpoint-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click(); URL.revokeObjectURL(url); this.message('Backup JSON exportado.');
    this.posthogService.posthog.capture('backup_exported', {
      tournament_mode: this.state.tournamentMode,
      tournament_size: this.state.size,
      has_schedule: this.hasSchedule,
      is_finalized: !!this.state.finishedAt,
    });
  }

  private initializeScoreDrafts(): void {
    this.scoreDrafts = {};
    for (const round of this.state.rounds) for (const match of round.matches) {
      this.scoreDrafts[match.id] = { a: match.scoreA, b: match.scoreB, tieBreakA: match.tieBreakA ?? null, tieBreakB: match.tieBreakB ?? null };
    }
    for (const match of this.state.finals?.matches ?? []) {
      this.scoreDrafts[match.id] = { a: match.scoreA, b: match.scoreB, tieBreakA: match.tieBreakA ?? null, tieBreakB: match.tieBreakB ?? null };
    }
  }

  private syncDefaultFixedPairs(): void {
    if (!this.fixedPairsMode || this.state.players.length !== this.state.size) {
      this.state.fixedPairs = [];
      return;
    }
    if (this.isMixedDoubles) {
      const men = this.state.players.filter(player => player.gender === 'male');
      const women = this.state.players.filter(player => player.gender === 'female');
      if (men.length !== this.state.size / 2 || women.length !== this.state.size / 2) {
        this.state.fixedPairs = [];
        return;
      }
      this.state.fixedPairs = Array.from({ length: this.state.size / 2 }, (_, index) => [men[index]?.id ?? '', women[index]?.id ?? '']);
      return;
    }
    this.state.fixedPairs = Array.from({ length: this.state.size / 2 }, (_, index) => [
      this.state.players[index * 2].id,
      this.state.players[index * 2 + 1].id
    ]);
  }

  private normalizeGamesToWin(): void {
    if (!this.availableGamesToWin.includes(this.state.gamesToWin)) this.state.gamesToWin = 4;
  }

  private persist(success?: string): void {
    try { this.storage.saveTournament(this.state); if (success) this.message(success); }
    catch (error) { this.message(error instanceof Error ? error.message : 'Falha ao salvar.', 'error'); }
    if (this.isSharedMode && this.isSharedModerator && this.state.sharedTournamentId && this.state.sharedStatus === 'active') {
      if (this.syncTimeout !== null) window.clearTimeout(this.syncTimeout);
      this.syncTimeout = window.setTimeout(() => {
        void this.supabase.saveSharedTournament(this.state.sharedTournamentId!, this.state)
          .then(snapshot => {
            this.state.sharedStatus = snapshot.status;
            if (this.sharedSnapshot?.id === snapshot.id) this.sharedSnapshot = snapshot;
          })
          .catch(error => { this.sharedError = this.sharedErrorMessage(error); });
      }, 250);
    }
    if (this.localLiveWriteToken && this.state.analyticsId === this.localLiveAnalyticsId && !this.isLiveViewer && !this.isSharedMode) {
      if (this.localLiveUpdateTimeout !== null) window.clearTimeout(this.localLiveUpdateTimeout);
      this.localLiveUpdateTimeout = window.setTimeout(() => {
        void this.supabase.updateLocalLiveTournament(this.localLiveWriteToken, this.state)
          .then(() => this.supabase.notifyLocalLiveTournament(this.localLiveId))
          .catch(error => { this.localLiveError = error instanceof Error ? error.message : 'Não foi possível atualizar o link ao vivo.'; });
      }, 250);
    }
  }
  private message(text: string, type: 'success' | 'error' = 'success'): void { this.notice = text; this.noticeType = type; }
  private clearNotice(): void { this.notice = ''; }
  private id(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}
