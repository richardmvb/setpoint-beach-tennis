import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Match, Page, Player, PlayerStanding, SharedTournamentSnapshot, ThemeMode, TournamentGroup, TournamentMode, GroupFormat, TournamentHostingMode, TournamentSize, TournamentState } from './core/models';
import { StorageService } from './core/storage.service';
import { ScheduleService } from './core/schedule.service';
import { GroupScheduleService } from './core/group-schedule.service';
import { FinalsService, PodiumPlace } from './core/finals.service';
import { SupabaseService } from './core/supabase.service';
import { ShareCardService } from './core/share-card.service';

interface GroupStandingEntry {
  label: string;
  playerIds: string[];
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  matchesPlayed: number;
}

interface GroupStandingTable {
  id: string;
  name: string;
  entries: GroupStandingEntry[];
}

const ACCESS_PASSWORD = 'bt2026';
const UNLOCK_SESSION_KEY = 'setpoint.unlocked';
const SHARED_SETUP_KEY = 'setpoint.shared.setup';
const OWNER_INVITE_KEY = 'setpoint.shared.ownerInvite';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
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

  constructor(
    private storage: StorageService,
    private scheduler: ScheduleService,
    private groupScheduler: GroupScheduleService,
    private finalsScheduler: FinalsService,
    private supabase: SupabaseService,
    private shareCard: ShareCardService
  ) {
    const inviteToken = new URLSearchParams(window.location.search).get('invite') ?? '';
    const authCallback = new URLSearchParams(window.location.search).has('code')
      || window.location.hash.includes('access_token=');
    this.isGuestView = !!inviteToken;
    this.sharedInviteToken = inviteToken;
    try { this.isLocked = !this.isGuestView && !authCallback && sessionStorage.getItem(UNLOCK_SESSION_KEY) !== 'true'; }
    catch { this.isLocked = true; }
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
    this.page = this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    if (!this.state.rounds.length) {
      if (!this.availableCourts.includes(this.state.courts)) this.state.courts = Math.floor(this.state.size / 4);
      this.state.roundCount = this.requiredRounds;
    }
    this.theme = this.storage.loadTheme();
    this.initializeScoreDrafts();
  }

  ngOnInit(): void {
    this.applyTheme();
    void this.restoreSharedFlow();
  }

  get sharedConfigured(): boolean { return this.supabase.isConfigured; }
  get isSharedMode(): boolean { return this.state.hostingMode === 'shared'; }
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
    return this.isGuestView && !!this.sharedSnapshot?.canJoin && !this.guestName.trim();
  }
  get sharedStatusLabel(): string {
    switch (this.sharedSnapshot?.status) {
      case 'registration': return 'Inscrições abertas';
      case 'ready': return 'Vagas preenchidas · aguardando início';
      case 'active': return 'Torneio em andamento';
      case 'completed': return 'Torneio concluído';
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

  navigate(page: Page): void { this.page = page; this.clearNotice(); }
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
      return;
    }
    if (this.state.players.length !== this.state.size) {
      return this.message(`Cadastre exatamente ${this.state.size} jogadores para continuar.`, 'error');
    }
    this.setupStep = 3;
    this.clearNotice();
  }

  async requestSharedTournamentLogin(): Promise<void> {
    if (!this.sharedConfigured) return this.message('O modo compartilhado ainda não está configurado neste deploy.', 'error');
    if (!this.moderatorName.trim() || !this.moderatorEmail.trim()) {
      return this.message('Informe seu nome e e-mail para receber o link de acesso do moderador.', 'error');
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
      if (await this.supabase.currentUser()) {
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
      this.sharedError = error instanceof Error ? error.message : 'Não foi possível enviar o link de acesso.';
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
      this.isGuestView = true;
      this.isSharedModerator = false;
      this.applySharedSnapshot(snapshot);
      this.subscribeToShared(snapshot.id, false);
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
      sessionStorage.setItem(OWNER_INVITE_KEY, invite.inviteToken);
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
      this.page = 'shared';
      this.guestName = await this.supabase.getGuestName(this.sharedInviteToken);
      try {
        let snapshot = await this.supabase.getSharedTournament(this.sharedInviteToken);
        if (this.guestName) snapshot = await this.supabase.joinSharedTournament(this.sharedInviteToken, this.guestName);
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
        this.sharedInviteToken = sessionStorage.getItem(OWNER_INVITE_KEY) ?? '';
        this.applySharedSnapshot(snapshot);
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
      if (this.sharedInviteToken) sessionStorage.setItem(OWNER_INVITE_KEY, this.sharedInviteToken);
      this.applySharedSnapshot(snapshot);
      this.setupStep = 2;
      this.persist();
      this.subscribeToShared(snapshot.id, true);
      this.sharedNotice = 'Torneio compartilhado criado. Envie o convite para preencher as vagas.';
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  private applySharedSnapshot(snapshot: SharedTournamentSnapshot): void {
    this.sharedSnapshot = snapshot;
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
    this.page = this.isGuestView ? 'shared' : this.state.rounds.length ? 'overview' : 'setup';
    this.initializeScoreDrafts();
  }

  private subscribeToShared(id: string, owner: boolean): void {
    this.supabase.subscribeToSharedTournament(id, () => { void this.refreshSharedState(id, owner); });
  }

  private async refreshSharedState(id: string, owner: boolean): Promise<void> {
    try {
      const snapshot = owner
        ? await this.supabase.getOwnedSharedTournament(id)
        : await this.supabase.getSharedTournament(this.sharedInviteToken);
      this.applySharedSnapshot(snapshot);
    } catch (error) {
      this.sharedError = this.sharedErrorMessage(error);
    }
  }

  private sharedErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('registration_closed') || message.includes('invite_expired')) return 'Este convite expirou ou as inscrições foram encerradas.';
    if (message.includes('tournament_full')) return 'As vagas deste torneio já foram preenchidas.';
    if (message.includes('tournament_expired')) return 'Este torneio compartilhado já expirou.';
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
        const snapshot = await this.supabase.startSharedTournament(this.state.sharedTournamentId, this.state);
        this.applySharedSnapshot(snapshot);
      }
      this.selectedRound = 0; this.initializeScoreDrafts(); this.persist('Todas as rodadas foram geradas e salvas.'); this.page = 'rounds';
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
    if (!this.canEditScores) return;
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
    if (!this.canEditScores) return;
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
    match.scoreA = draft.a;
    match.scoreB = draft.b;
    match.tieBreakA = draft.tieBreakA ?? null;
    match.tieBreakB = draft.tieBreakB ?? null;
    this.state.finals = this.finalsScheduler.updatePodium(this.state.finals!);
    this.persist();
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
    if (!this.canEditScores) return;
    if (!confirm('Remover o placar desta partida? O ranking será recalculado.')) return;
    match.scoreA = null; match.scoreB = null; match.tieBreakA = null; match.tieBreakB = null;
    this.scoreDrafts[match.id] = { a: null, b: null, tieBreakA: null, tieBreakB: null };
    if (match.phase === 'final' && this.state.finals) this.state.finals = this.finalsScheduler.updatePodium(this.state.finals);
    this.persist('Placar removido.');
  }

  selectRound(index: number): void { this.selectedRound = index; }
  playerName(id: string): string { return this.state.players.find(p => p.id === id)?.name ?? 'Jogador removido'; }
  groupName(groupId: string): string { return this.state.groups?.find(group => group.id === groupId)?.name ?? groupId; }
  initials(name: string): string { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
  isScored(match: Match): boolean { return match.scoreA !== null && match.scoreB !== null; }
  roundDone(index: number): boolean { return this.state.rounds[index]?.matches.every(m => this.isScored(m)) ?? false; }
  roundMatchesDone(index: number): number { return this.state.rounds[index]?.matches.filter(m => this.isScored(m)).length ?? 0; }
  matchPending(match: Match): boolean { return !this.isScored(match); }

  resetTournament(): void {
    if (!confirm('Isso apagará a tabela, os placares e os participantes salvos neste navegador. Deseja continuar?')) return;
    this.storage.clearTournament();
    this.state = { version: 1, name: 'Super de sábado', size: 8, courts: 2, gamesToWin: 4, roundCount: 7, players: [], rounds: [], createdAt: new Date().toISOString(), tournamentMode: 'super', groupFormat: 'rotating', groups: [], fixedPairs: [], finals: null };
    this.selectedRound = 0; this.setupStep = 1; this.page = 'setup'; this.message('Novo torneio iniciado.');
  }

  exportBackup(): void {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `setpoint-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click(); URL.revokeObjectURL(url); this.message('Backup JSON exportado.');
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
