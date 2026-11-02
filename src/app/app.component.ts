import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Match, Page, Player, PlayerStanding, SharedTournamentSnapshot, ThemeMode, TournamentGroup, TournamentMode, GroupFormat, TournamentHostingMode, TournamentSize, TournamentState } from './core/models';
import { StorageService } from './core/storage.service';
import { ScheduleService } from './core/schedule.service';
import { GroupScheduleService } from './core/group-schedule.service';
import { FinalsService, PodiumPlace } from './core/finals.service';
import { DashboardMetrics, SupabaseService } from './core/supabase.service';
import type { User } from '@supabase/supabase-js';
import { ShareCardService, formatElapsed } from './core/share-card.service';
import { GroupStandingTable } from './features/ranking-view.component';
import { RankingViewComponent } from './features/ranking-view.component';
import { PodiumComponent } from './features/podium.component';
import { QualificationRow, QualificationService } from './core/qualification.service';
import { QualificationStatsComponent } from './features/qualification-stats.component';
import { PostHogService } from './core/posthog.service';
import { environment } from '../environments/environment';

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
const DASHBOARD_PASSWORD = 'dashbt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';
const DASHBOARD_UNLOCK_SESSION_KEY = 'setpoint.dashboard.unlocked';
const SHARED_SETUP_KEY = 'setpoint.shared.setup';
const OWNER_INVITE_KEY = 'setpoint.shared.ownerInvite';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RankingViewComponent, PodiumComponent, QualificationStatsComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly posthogService = inject(PostHogService);

  isLocked = true;
  sitePassword = '';
  lockError = '';
  page: Page = 'setup';
  theme: ThemeMode = 'light';
  state: TournamentState;
  selectedRound = 0;
  setupStep = 1;
  newPlayerName = '';
  notice = '';
  noticeType: 'success' | 'error' = 'success';
  scoreDrafts: Record<string, { a: number | null; b: number | null; tieBreakA?: number | null; tieBreakB?: number | null }> = {};
  tieDrawModalOpen = false;
  activeTiePlayerIds: string[] = [];
  activeTieDrawResult: string[] = [];
  moderatorEmail = '';
  moderatorName = '';
  moderatorAuthMode: 'anonymous' | 'email' = 'anonymous';
  manualParticipantName = '';
  now = Date.now();
  private clockTimer: number | null = null;
  guestName = '';
  sharedLoading = false;
  sharedError = '';
  sharedNotice = '';
  isGuestView = false;
  isSharedModerator = false;
  sharedSnapshot: SharedTournamentSnapshot | null = null;
  sharedInviteToken = '';
  sharePlayerId = '';
  sharingResults = false;
  shareMessage = '';
  private syncTimeout: number | null = null;
  private sharedPollTimer: number | null = null;
  private authStateUnsubscribe: (() => void) | null = null;
  private identifiedUserId: string | null = null;
  private sharedSignature = '';
  guestJoined = false;
  feedbackLoading = false;
  feedbackMessage = '';
  isDashboardRoute = false;
  dashboardLocked = false;
  dashboardPassword = '';
  dashboardError = '';
  dashboardLoading = false;
  dashboardMetrics: DashboardMetrics | null = null;
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
    const authCallback = new URLSearchParams(window.location.search).has('code')
      || window.location.hash.includes('access_token=');
    this.appBasePath = new URL(document.baseURI).pathname.replace(/\/+$/, '');
    this.isDashboardRoute = this.isDashboardPath(window.location.pathname);
    this.isGuestView = !!inviteToken;
    this.sharedInviteToken = inviteToken;
    try {
      this.isLocked = !this.isDashboardRoute && !this.isGuestView && !authCallback
        && sessionStorage.getItem(UNLOCK_SESSION_KEY) !== 'true';
      this.dashboardLocked = this.isDashboardRoute
        && sessionStorage.getItem(DASHBOARD_UNLOCK_SESSION_KEY) !== 'true';
    } catch {
      this.isLocked = !this.isDashboardRoute && !this.isGuestView && !authCallback;
      this.dashboardLocked = this.isDashboardRoute;
    }
    this.state = this.storage.loadTournament() ?? {
      version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4,
      roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(),
      tournamentMode: 'super', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null
    };
    this.state.tournamentMode ??= 'super';
    this.state.hostingMode ??= 'local';
    this.state.groupFormat ??= 'rotating';
    this.state.groups ??= [];
    this.state.fixedPairs ??= [];
    this.state.finals ??= null;
    this.state.tieBreakDraws ??= [];
    this.page = this.isDashboardRoute ? 'dashboard' : this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    if (!this.state.rounds.length) {
      if (!this.availableCourts.includes(this.state.courts)) this.state.courts = Math.floor(this.state.size / 4);
      this.state.roundCount = this.requiredRounds;
    }
    this.theme = this.storage.loadTheme();
    this.initializeScoreDrafts();
  }

  ngOnInit(): void {
    window.addEventListener('popstate', this.onPopState);
    this.posthogService.init(environment.posthogKey, {
      api_host: environment.posthogHost,
      capture_exceptions: true,
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
    this.authStateUnsubscribe = this.supabase.onAuthStateChange((event, user) => {
      if (event === 'SIGNED_IN' && user) this.identifyUser(user);
      if (event === 'SIGNED_OUT') {
        this.posthogService.posthog.reset();
        this.identifiedUserId = null;
      }
    });
    void this.identifyCurrentUser();
    this.applyTheme();
    if (this.isDashboardRoute && !this.dashboardLocked) void this.loadDashboardMetrics();
    if (!this.isLocked && !this.isDashboardRoute && !this.isGuestView) this.backfillLocalTournamentMetrics();
    this.clockTimer = window.setInterval(() => { if (this.timerRunning) this.now = Date.now(); }, 1000);
    this.sharedPollTimer = window.setInterval(() => this.pollShared(), 4000);
    void this.restoreSharedFlow();
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.onPopState);
    if (this.clockTimer !== null) window.clearInterval(this.clockTimer);
    if (this.sharedPollTimer !== null) window.clearInterval(this.sharedPollTimer);
    this.authStateUnsubscribe?.();
  }

  private async identifyCurrentUser(): Promise<void> {
    const user = await this.supabase.currentUser();
    if (user) this.identifyUser(user);
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
  placeOf(playerId: string): number { return this.shareCard.placementOf(this.state, this.standings, playerId); }
  get shareCandidates(): { playerId: string; name: string; place: number }[] {
    return this.state.players
      .map(player => ({ playerId: player.id, name: player.name, place: this.placeOf(player.id) }))
      .sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
  }
  trackByPlayerId(_: number, item: { playerId: string }): string { return item.playerId; }
  get guestPlayerId(): string {
    const name = this.guestName.trim().toLowerCase();
    return this.state.players.find(player => player.name.trim().toLowerCase() === name)?.id ?? '';
  }
  get guestPlace(): number { return this.guestPlayerId ? this.placeOf(this.guestPlayerId) : 0; }
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
    return this.isGuestView && !!this.sharedSnapshot?.canJoin && !this.guestJoined;
  }
  get sharedStatusLabel(): string {
    switch (this.sharedSnapshot?.status) {
      case 'registration': return 'Inscrições abertas';
      case 'ready': return 'Vagas preenchidas · aguardando início';
      case 'active': return 'Torneio em andamento';
      case 'completed': return 'Torneio concluído';
      case 'archived': return 'Torneio arquivado';
      default: return 'Carregando torneio';
    }
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

  unlockDashboard(): void {
    if (this.dashboardPassword !== DASHBOARD_PASSWORD) {
      this.dashboardPassword = '';
      this.dashboardError = 'Senha incorreta.';
      return;
    }
    try { sessionStorage.setItem(DASHBOARD_UNLOCK_SESSION_KEY, 'true'); } catch { /* desbloqueio vale até recarregar */ }
    this.dashboardLocked = false;
    this.dashboardPassword = '';
    this.dashboardError = '';
    void this.loadDashboardMetrics();
  }

  async loadDashboardMetrics(): Promise<void> {
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

  private scrollGuestToLatestUpdate(): void {
    const targetId = this.state.finals ? 'guest-finals'
      : this.state.rounds.length ? 'guest-ranking' : 'guest-participants';
    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'end'
      });
    }, 100);
  }

  get hasSchedule(): boolean { return this.state.rounds.length > 0; }
  get canEditScores(): boolean {
    return !this.isGuestView && (!this.isSharedMode
      || (this.isSharedModerator && this.state.sharedStatus === 'active'));
  }
  get hasFinals(): boolean { return !!this.state.finals; }
  get canGenerateFinal(): boolean {
    return this.canEditScores && this.hasSchedule && !this.hasFinals && this.state.players.length >= 8
      && this.state.rounds.every(round => round.matches.every(match => this.isScored(match)));
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
  get fixedPairsMode(): boolean { return this.isGroupTournament && this.state.groupFormat === 'fixed'; }
  get availableGamesToWin(): number[] {
    return this.isGroupTournament ? [4, 5, 6] : [3, 4, 5, 6];
  }
  get availableSizes(): TournamentSize[] { return this.isGroupTournament ? [8, 12] : [8, 10, 12]; }
  get availableCourts(): number[] {
    if (this.isGroupTournament) return [this.state.size / 4];
    return this.state.size === 12 ? [2, 3] : [2];
  }
  get requiredRounds(): number {
    if (this.isGroupTournament) return this.fixedPairsMode ? this.state.size / 2 - 1 : 3;
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
  get standings(): PlayerStanding[] { return this.rankedStandingGroups().flat(); }

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

  private rankedStandingGroups(): PlayerStanding[][] {
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
      try { this.dashboardLocked = sessionStorage.getItem(DASHBOARD_UNLOCK_SESSION_KEY) !== 'true'; }
      catch { this.dashboardLocked = true; }
      window.history.pushState({}, '', `${this.appBasePath}/dashboard`);
      if (!this.dashboardLocked) void this.loadDashboardMetrics();
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
      try { this.dashboardLocked = sessionStorage.getItem(DASHBOARD_UNLOCK_SESSION_KEY) !== 'true'; }
      catch { this.dashboardLocked = true; }
      if (!this.dashboardLocked) void this.loadDashboardMetrics();
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
      tournament_size: this.state.size,
    });
  }

  private trackSetupStepCompleted(step: number): void {
    this.posthogService.posthog.capture('tournament_setup_step_completed', {
      step,
      hosting_mode: this.state.hostingMode,
      tournament_mode: this.state.tournamentMode,
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
    if (this.hasSchedule) return this.message('A lista está bloqueada porque a tabela já foi gerada.', 'error');
    if (this.isSharedMode) return this.message('No torneio compartilhado, os participantes entram pelo link de convite.', 'error');
    if (this.state.players.length >= this.state.size) return this.message(`O Super ${this.state.size} permite ${this.state.size} jogadores.`, 'error');
    if (this.state.players.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return this.message('Já existe um participante com esse nome.', 'error');
    this.state.players.push({ id: this.id(), name });
    this.syncDefaultFixedPairs();
    this.newPlayerName = ''; this.persist();
    this.posthogService.posthog.capture('player_added', {
      tournament_mode: this.state.tournamentMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
    });
  }

  removePlayer(id: string): void {
    if (this.hasSchedule) return;
    if (this.isSharedMode) return this.message('Não é possível remover participantes do torneio compartilhado.', 'error');
    this.state.players = this.state.players.filter(p => p.id !== id);
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
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      court_count: this.state.courts,
      games_to_win: this.state.gamesToWin,
    });
  }

  changeSize(size: TournamentSize): void {
    if (!this.availableSizes.includes(size)) return;
    this.state.size = size;
    this.state.courts = this.availableCourts[0];
    this.normalizeGamesToWin();
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
  }

  changeCourts(courts: number): void {
    if (!this.availableCourts.includes(courts)) return;
    this.state.courts = courts;
    this.state.roundCount = this.requiredRounds;
  }

  changeTournamentMode(mode: TournamentMode): void {
    this.state.tournamentMode = mode;
    if (!this.availableSizes.includes(this.state.size)) this.state.size = 8;
    this.state.courts = this.availableCourts[0];
    this.normalizeGamesToWin();
    this.state.roundCount = this.requiredRounds;
    this.syncDefaultFixedPairs();
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
    if (!this.moderatorName.trim() || (this.moderatorAuthMode === 'email' && !this.moderatorEmail.trim())) {
      return this.message(this.moderatorAuthMode === 'email'
        ? 'Informe seu nome e e-mail para receber o link de acesso do moderador.'
        : 'Informe seu nome para entrar como moderador.', 'error');
    }
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
      const reusableSession = !!user && !(this.moderatorAuthMode === 'email' && user.is_anonymous);
      if (reusableSession) {
        await this.createSharedTournamentOnServer();
        return;
      }
      if (this.moderatorAuthMode === 'anonymous') {
        await this.supabase.signInAnonymously();
        await this.createSharedTournamentOnServer();
        return;
      }
      const draft = { ...this.state, players: [], rounds: [], groups: [], fixedPairs: [], finals: null };
      localStorage.setItem(SHARED_SETUP_KEY, JSON.stringify({ state: draft, moderatorName: this.moderatorName.trim() }));
      this.storage.saveTournament(draft);
      const redirect = new URL(document.baseURI);
      redirect.search = '';
      redirect.hash = '';
      await this.supabase.requestModeratorLogin(this.moderatorEmail.trim(), redirect.toString());
      this.sharedNotice = 'Enviamos um link de acesso ao e-mail do moderador.';
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
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      this.applySharedSnapshot(await this.supabase.addSharedParticipant(this.state.sharedTournamentId, name), true);
      this.manualParticipantName = '';
      this.posthogService.posthog.capture('shared_participant_added_manually', {
        tournament_mode: this.state.tournamentMode,
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
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      const snapshot = await this.supabase.joinSharedTournament(this.sharedInviteToken, name);
      this.guestName = name;
      this.guestJoined = true;
      this.isGuestView = true;
      this.isSharedModerator = false;
      this.applySharedSnapshot(snapshot);
      this.subscribeToShared(snapshot.id, false);
      this.scrollGuestToLatestUpdate();
      this.posthogService.posthog.capture('shared_tournament_joined', {
        tournament_mode: this.state.tournamentMode,
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
        tournament_size: this.state.size,
      });
    } catch {
      this.sharedError = 'Não foi possível copiar. Selecione e copie o link manualmente.';
    }
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
    this.sharingResults = true;
    this.shareMessage = '';
    try {
      const result = await this.shareCard.sharePlayerResults(this.state, this.standings, this.sharePlayerId);
      this.shareMessage = result === 'shared' ? 'Compartilhe a imagem no Instagram ou em outra rede.' : 'Imagem dos resultados baixada.';
      this.posthogService.posthog.capture('results_shared', {
        share_method: result,
        tournament_mode: this.state.tournamentMode,
        tournament_size: this.state.size,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.shareMessage = error instanceof Error ? error.message : 'Não foi possível compartilhar os resultados.';
    } finally {
      this.sharingResults = false;
    }
  }

  private async restoreSharedFlow(): Promise<void> {
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

    const pending = localStorage.getItem(SHARED_SETUP_KEY) ?? sessionStorage.getItem(SHARED_SETUP_KEY);
    if (pending && await this.supabase.currentUser()) {
      try {
        const draft = JSON.parse(pending) as { state: TournamentState; moderatorName: string };
        localStorage.removeItem(SHARED_SETUP_KEY);
        sessionStorage.removeItem(SHARED_SETUP_KEY);
        this.state = draft.state;
        this.moderatorName = draft.moderatorName;
        await this.createSharedTournamentOnServer();
      } catch (error) {
        this.sharedError = this.sharedErrorMessage(error);
      }
      return;
    }

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
      const snapshot = await this.supabase.createSharedTournament(draft, this.moderatorName.trim());
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
        tournament_size: this.state.size,
      });
      this.posthogService.posthog.capture('shared_tournament_created', {
        tournament_mode: this.state.tournamentMode,
        tournament_size: this.state.size,
        moderator_auth_mode: this.moderatorAuthMode,
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
    if (this.isGuestView && hadPreviousSnapshot && !wasFinished && snapshot.state.finishedAt) {
      window.setTimeout(() => { void this.openNpsFeedback(true); }, 0);
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
      this.applySharedSnapshot(snapshot, true);
      if (!owner) this.scrollGuestToLatestUpdate();
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  // Garante a atualização mesmo quando o Realtime não entrega o aviso.
  private pollShared(): void {
    if (document.hidden || this.sharedLoading) return;
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
          this.state.fixedPairs ?? []
        );
        this.state.groups = schedule.groups;
        this.state.rounds = schedule.rounds;
      } else {
        this.state.groups = [];
        this.state.rounds = this.scheduler.generate(this.state.players, this.state.size, this.state.courts, this.state.roundCount);
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
          tournament_size: this.state.size,
        });
      }
      this.posthogService.posthog.capture('tournament_started', {
        hosting_mode: this.state.hostingMode,
        tournament_mode: this.state.tournamentMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
      });
      this.posthogService.posthog.capture('schedule_generated', {
        tournament_mode: this.state.tournamentMode,
        hosting_mode: this.state.hostingMode,
        tournament_size: this.state.size,
        round_count: this.state.rounds.length,
        court_count: this.state.courts,
      });
      this.posthogService.logInfo('tournament schedule generated', {
        tournament_mode: this.state.tournamentMode,
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
      this.state.finals = this.finalsScheduler.create(this.standings);
      this.initializeScoreDrafts();
      this.persist('Finais geradas com base nos oito primeiros do ranking.');
      this.posthogService.posthog.capture('finals_generated', {
        tournament_mode: this.state.tournamentMode,
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
    if (!this.canEditFinalScores) return;
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
      });
    }
  }

  finalizeTournament(): void {
    if (!this.canFinalizeTournament) return;
    if (!confirm('Finalizar o torneio? Depois disso nenhum resultado poderá ser alterado.')) return;
    const finishedAt = new Date().toISOString();
    this.state.finishedAt = finishedAt;
    this.persist('Torneio finalizado.');
    if (!this.isSharedMode) this.syncLocalTournamentMetrics();
    this.posthogService.posthog.capture('tournament_finalized', {
      tournament_mode: this.state.tournamentMode,
      hosting_mode: this.state.hostingMode,
      tournament_size: this.state.size,
      participant_count: this.state.players.length,
      duration_seconds: this.state.startedAt
        ? Math.round((Date.parse(finishedAt) - Date.parse(this.state.startedAt)) / 1000)
        : undefined,
    });
    this.posthogService.logInfo('tournament finalized', {
      tournament_mode: this.state.tournamentMode,
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
      document.getElementById(`round-tab-${index}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center'
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
    if (this.isSharedModerator && this.state.sharedTournamentId) { void this.cancelSharedTournament(); return; }
    if (!confirm('Isso apagará a tabela, os placares e os participantes salvos neste navegador. Deseja continuar?')) return;
    if (!this.isSharedMode) this.syncLocalTournamentMetrics(true);
    this.clearLocalTournament();
  }

  private syncLocalTournamentMetrics(abandoned = false): void {
    if (this.state.hostingMode === 'shared' || !this.state.startedAt) return;
    this.state.analyticsId ??= this.id();
    const snapshot = { ...this.state };
    void this.supabase.recordLocalTournamentMetrics(snapshot, abandoned).catch(() => undefined);
  }

  async cancelSharedTournament(): Promise<void> {
    const id = this.state.sharedTournamentId;
    if (!this.isSharedModerator || !id) return;
    if (!confirm('Arquivar este torneio e recomeçar? O convite será invalidado. O histórico e os participantes serão preservados no dashboard.')) return;
    this.sharedLoading = true;
    this.sharedError = '';
    try {
      await this.supabase.cancelSharedTournament(id);
      this.clearLocalTournament();
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    } finally {
      this.sharedLoading = false;
    }
  }

  private clearLocalTournament(): void {
    this.storage.clearTournament();
    this.leaveSharedTournament();
    this.state = { version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4, roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(), tournamentMode: 'super', hostingMode: 'local', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null };
    this.selectedRound = 0; this.setupStep = 1; this.setPage('setup'); this.trackSetupStepViewed(1); this.message('Novo torneio iniciado.');
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
  }
  private message(text: string, type: 'success' | 'error' = 'success'): void { this.notice = text; this.noticeType = type; }
  private clearNotice(): void { this.notice = ''; }
  private id(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}
