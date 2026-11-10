import { Injectable } from '@angular/core';
import { Match, TournamentState, ThemeMode } from './models';
import { LocalProfile, parseProfile, PROFILE_KEY, serializeProfile } from './profile';
import { calculateFinalLiveScore, finalLiveMatchScore, MAX_FINAL_LIVE_POINTS } from './final-live-score';

const STATE_KEY = 'setpoint.tournament.v1';
const THEME_KEY = 'setpoint.theme.v1';
const BUILD_KEY = 'setpoint.build.v1';

@Injectable({ providedIn: 'root' })
export class StorageService {
  loadTournament(): TournamentState | null {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = this.parseTournament(raw);
      if (!parsed) localStorage.removeItem(STATE_KEY);
      return parsed;
    } catch {
      return null;
    }
  }

  parseTournament(raw: string): TournamentState | null {
    if (!raw || raw.length > 1_000_000) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!this.isTournamentState(parsed)) return null;
      return {
        ...parsed,
        tournamentMode: parsed.tournamentMode ?? 'super',
        groupFormat: parsed.groupFormat ?? 'rotating'
      };
    } catch {
      return null;
    }
  }

  saveTournament(state: TournamentState): void {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Não foi possível salvar o torneio no navegador.', error);
      throw new Error('O armazenamento local está cheio ou indisponível. Exporte os dados ou libere espaço no navegador.');
    }
  }

  clearCompletedTournamentOnVersionChange(buildId: string, state: TournamentState | null): boolean {
    try {
      const previousBuild = localStorage.getItem(BUILD_KEY);
      if (!previousBuild) { localStorage.setItem(BUILD_KEY, buildId); return false; }
      if (previousBuild === buildId || (state && !state.finishedAt)) return false;
      this.clearTournament();
      localStorage.setItem(BUILD_KEY, buildId);
      return true;
    } catch { return false; }
  }

  loadTheme(): ThemeMode {
    try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  }

  saveTheme(theme: ThemeMode): void {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* tema é uma preferência não crítica */ }
  }

  loadProfile(): LocalProfile {
    try { return parseProfile(localStorage.getItem(PROFILE_KEY)); }
    catch { return parseProfile(null); }
  }

  saveProfile(profile: LocalProfile): void {
    try { localStorage.setItem(PROFILE_KEY, serializeProfile(profile)); } catch { /* perfil é uma preferência não crítica */ }
  }

  clearTournament(): void {
    localStorage.removeItem(STATE_KEY);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('setpoint.shared.')) localStorage.removeItem(key);
    }
    try { sessionStorage.removeItem('setpoint.shared.setup'); } catch { /* sessão indisponível */ }
  }

  private validFinalLiveScore(match: Match): boolean {
    if (match.livePoints === undefined) return true;
    if (match.finalKind !== 'championship' || !Array.isArray(match.livePoints)
      || match.livePoints.length > MAX_FINAL_LIVE_POINTS
      || match.livePoints.some(point => point !== 'A' && point !== 'B')) return false;
    try {
      const score = finalLiveMatchScore(calculateFinalLiveScore(match.livePoints));
      return match.scoreA === score.scoreA && match.scoreB === score.scoreB
        && (match.tieBreakA ?? null) === score.tieBreakA && (match.tieBreakB ?? null) === score.tieBreakB;
    } catch { return false; }
  }

  private isTournamentState(value: unknown): value is TournamentState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<TournamentState>;
    if (candidate.version !== 1 || (candidate.size !== 8 && candidate.size !== 10 && candidate.size !== 12 && candidate.size !== 24)
      || (candidate.tournamentMode !== undefined && !['super', 'groups'].includes(candidate.tournamentMode))
      || (candidate.groupFormat !== undefined && !['fixed', 'rotating'].includes(candidate.groupFormat))
      || (candidate.doublesFormat !== undefined && !['open', 'mixed'].includes(candidate.doublesFormat))
      || (candidate.mixedFinalFormat !== undefined && !['knockout', 'direct'].includes(candidate.mixedFinalFormat))
      || (candidate.startedAt !== undefined && Number.isNaN(Date.parse(candidate.startedAt)))
      || (candidate.finishedAt !== undefined && Number.isNaN(Date.parse(candidate.finishedAt)))
      || (candidate.analyticsId !== undefined && typeof candidate.analyticsId !== 'string')
      || (candidate.qualificationStats !== undefined && typeof candidate.qualificationStats !== 'boolean')
      || typeof candidate.name !== 'string' || candidate.name.length > 60
      || !Number.isInteger(candidate.courts) || (candidate.courts ?? 0) < 1 || (candidate.courts ?? 0) > 6
      || ![3, 4, 5, 6].includes(candidate.gamesToWin ?? 0)
      || !Number.isInteger(candidate.roundCount) || (candidate.roundCount ?? 0) < 2 || (candidate.roundCount ?? 0) > 46
      || !Array.isArray(candidate.players) || candidate.players.length > 24
      || !Array.isArray(candidate.rounds) || candidate.rounds.length > 46) return false;

    if (candidate.groups !== undefined && (!Array.isArray(candidate.groups) || candidate.groups.length > 6
      || !candidate.groups.every(group => !!group && typeof group.id === 'string'
        && typeof group.name === 'string' && Array.isArray(group.playerIds)
        && group.playerIds.every(id => typeof id === 'string')))) return false;
    if (candidate.fixedPairs !== undefined && (!Array.isArray(candidate.fixedPairs)
      || candidate.fixedPairs.length > 12 || !candidate.fixedPairs.every(pair => Array.isArray(pair)
        && pair.length === 2 && pair.every(id => typeof id === 'string') && pair[0] !== pair[1]))) return false;
    if (candidate.tieBreakDraws !== undefined && (!Array.isArray(candidate.tieBreakDraws)
      || candidate.tieBreakDraws.length > 24 || !candidate.tieBreakDraws.every(draw => !!draw
        && Array.isArray(draw.playerIds) && draw.playerIds.length >= 2 && draw.playerIds.length <= 24
        && draw.playerIds.every(id => typeof id === 'string') && new Set(draw.playerIds).size === draw.playerIds.length
        && Array.isArray(draw.order) && draw.order.length === draw.playerIds.length
        && draw.order.every(id => typeof id === 'string') && new Set(draw.order).size === draw.order.length
        && typeof draw.createdAt === 'string'))) return false;

    const validPlayers = candidate.players.every(player => !!player && typeof player.id === 'string'
      && typeof player.name === 'string' && player.name.length > 0 && player.name.length <= 40
      && (player.photoDataUrl === undefined || (typeof player.photoDataUrl === 'string'
        && player.photoDataUrl.length <= 12_000 && player.photoDataUrl.startsWith('data:image/webp;base64,')))
      && (player.gender === undefined || player.gender === 'male' || player.gender === 'female'));
    if (!validPlayers) return false;
    if (candidate.doublesFormat === 'mixed' && candidate.players.some(player => !player.gender)) return false;
    const playerIds = new Set(candidate.players.map(player => player.id));
    if (candidate.tieBreakDraws?.some(draw => draw.playerIds.some(id => !playerIds.has(id))
      || draw.order.some(id => !playerIds.has(id))
      || draw.playerIds.some(id => !draw.order.includes(id)))) return false;

    const validRounds = candidate.rounds.every(round => !!round && Number.isInteger(round.number)
      && Array.isArray(round.restingPlayerIds) && round.restingPlayerIds.every(id => typeof id === 'string')
      && Array.isArray(round.matches) && round.matches.length <= 6
      && round.matches.every(match => !!match && typeof match.id === 'string'
        && match.livePoints === undefined
        && Number.isInteger(match.court) && Array.isArray(match.teamA) && match.teamA.length === 2
        && Array.isArray(match.teamB) && match.teamB.length === 2
        && [...match.teamA, ...match.teamB].every(id => typeof id === 'string')
        && (match.scoreA === null || (Number.isInteger(match.scoreA) && match.scoreA >= 0 && match.scoreA <= 6))
        && (match.scoreB === null || (Number.isInteger(match.scoreB) && match.scoreB >= 0 && match.scoreB <= 6))));
    if (!validRounds) return false;

    if (candidate.finals === undefined || candidate.finals === null) return true;
    const finals = candidate.finals;
    return !!finals && typeof finals.complete === 'boolean'
      && Array.isArray(finals.podiumPlayerIds) && finals.podiumPlayerIds.length <= 8
      && finals.podiumPlayerIds.every(id => typeof id === 'string')
      && Array.isArray(finals.matches) && finals.matches.length >= 2 && finals.matches.length <= 8
      && finals.matches.every(match => !!match && typeof match.id === 'string'
        && (match.finalKind === 'quarterfinal' || match.finalKind === 'semifinal' || match.finalKind === 'championship' || match.finalKind === 'third-place')
        && this.validFinalLiveScore(match)
        && Number.isInteger(match.court) && Array.isArray(match.teamA) && match.teamA.length === 2
        && Array.isArray(match.teamB) && match.teamB.length === 2
        && [...match.teamA, ...match.teamB].every(id => typeof id === 'string')
        && [match.scoreA, match.scoreB].every(score => score === null
          || (Number.isInteger(score) && score >= 0 && score <= 7))
        && [match.tieBreakA, match.tieBreakB].every(score => score === null || score === undefined
          || (Number.isInteger(score) && score >= 0 && score <= (match.livePoints === undefined ? 99 : MAX_FINAL_LIVE_POINTS))));
  }
}
