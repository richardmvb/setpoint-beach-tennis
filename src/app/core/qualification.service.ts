import { Injectable } from '@angular/core';
import { Match, PlayerStanding, TournamentState } from './models';
import { EngineMatch, EngineOptions, EngineResult, GoalPlace, GoalStatus, projectScenarios } from './scenario-engine';

export type QualificationStatus = 'secure' | 'inside' | 'chance' | 'out';

export interface QualificationRow {
  playerId: string;
  name: string;
  position: number;
  wins: number;
  remainingMatches: number;
  remainingGames: number;
  maxWins: number;
  winsNeeded: number | null;
  balance: number;
  thirdBalance: number;
  status: QualificationStatus;
  headline: string;
  detail: string;
}

export type ForcedResults = Readonly<Record<string, 'A' | 'B'>>;

export interface PathMatch {
  id: string;
  round: number;
  teamA: string;
  teamB: string;
  mine: boolean;
  /** Which side the athlete plays on, when they are in this match. */
  mySide: 'A' | 'B' | null;
  /** Chance of the goal if team A / team B wins (0..1). */
  ifAWins: number;
  ifBWins: number;
  swing: number;
  /** Which team's win is better for the athlete; null when it makes no difference. */
  better: 'A' | 'B' | null;
  forced?: 'A' | 'B';
}

interface PathRival {
  playerId: string;
  name: string;
  position: number;
  /** Points of chance (0..100) gained, on average, each time this rival loses. */
  gainPerLoss: number;
  remainingMatches: number;
}

export interface PathGoal {
  goal: GoalPlace;
  probability: number;
  status: GoalStatus;
  tieShare: number;
  headline: string;
  detail: string;
  tieNote: string;
  /** The athlete's own open matches, by round. */
  myMatches: PathMatch[];
  /** Games of other athletes that move the chance the most. */
  watchMatches: PathMatch[];
  rivals: PathRival[];
  /** Chance given the number of wins in the athlete's own open matches. */
  byMyWins: { wins: number; probability: number }[];
}

export interface PathProjection {
  playerId: string;
  playerName: string;
  position: number;
  wins: number;
  remainingMatches: number;
  openMatches: number;
  mode: 'exact' | 'simulated';
  expectedPlace: number;
  bestPlace: number;
  worstPlace: number;
  placeDistribution: number[];
  goals: Record<GoalPlace, PathGoal>;
  /** Matches the user assumed a result for ("e se?"). */
  forcedMatches: PathMatch[];
}

export interface TrendPoint {
  label: string;
  round: number;
  probability: Record<GoalPlace, number>;
}

const TOP_PLACES = 3;

@Injectable({ providedIn: 'root' })
export class QualificationService {
  // Projeção sobre a classificação atual; empate em vitórias é decidido pelo saldo de games.
  compute(state: TournamentState, standings: PlayerStanding[]): QualificationRow[] {
    if (standings.length <= TOP_PLACES) return [];
    const remaining = this.remainingMatches(state);
    return standings.map((row, index) => {
      const others = standings.filter((item) => item.playerId !== row.playerId);
      const cutoff = others[TOP_PLACES - 1];
      const remainingMatches = remaining.get(row.playerId) ?? 0;
      const maxWins = row.setsWon + remainingMatches;
      const ahead = others.filter((item) => item.setsWon > maxWins).length;
      const canReach = others.filter(
        (item) => item.setsWon + (remaining.get(item.playerId) ?? 0) >= row.setsWon,
      ).length;
      const position = index + 1;

      let status: QualificationStatus = position <= TOP_PLACES ? 'inside' : 'chance';
      if (ahead >= TOP_PLACES) status = 'out';
      else if (canReach < TOP_PLACES) status = 'secure';

      const needed = Math.max(0, cutoff.setsWon - row.setsWon + 1);
      const winsNeeded = status === 'chance' ? needed : null;
      const { headline, detail } = this.describe(
        status,
        position,
        row.setsWon,
        cutoff.setsWon,
        needed,
        remainingMatches,
        maxWins,
      );
      return {
        playerId: row.playerId,
        name: row.name,
        position,
        wins: row.setsWon,
        remainingMatches,
        remainingGames: remainingMatches * state.gamesToWin,
        maxWins,
        winsNeeded,
        balance: row.gameBalance,
        thirdBalance: cutoff.gameBalance,
        status,
        headline,
        detail,
      };
    });
  }

  private readonly pathCache = new Map<string, PathProjection>();
  private readonly trendCache = new Map<string, TrendPoint[]>();

  /**
   * Full path for one athlete: chance of 1st / top 2 / top 3, the matches that decide it and the rivals to watch.
   * Cached by the played results, so it is safe to call from a template getter.
   */
  projectPath(
    state: TournamentState,
    standings: PlayerStanding[],
    playerId: string,
    forced: ForcedResults = {},
  ): PathProjection | null {
    const player = standings.find((row) => row.playerId === playerId);
    if (!player || standings.length <= 1) return null;
    const key = `${playerId}|${JSON.stringify(forced)}|${this.resultsSignature(state)}`;
    const cached = this.pathCache.get(key);
    if (cached) return cached;

    const open = this.openMatches(state);
    const forcedIds = open.filter((match) => forced[match.id]);
    const engine = projectScenarios(
      standings.map((row) => ({ id: row.playerId, wins: row.setsWon })),
      open,
      playerId,
      { forced },
    );
    const position = standings.findIndex((row) => row.playerId === playerId) + 1;
    const toMatch = (
      match: EngineMatch,
      ifAWins: number,
      ifBWins: number,
      swing: number,
      better: 'A' | 'B' | null,
      mine: boolean,
      forcedSide?: 'A' | 'B',
    ): PathMatch => ({
      id: match.id,
      round: match.round,
      teamA: match.teamA.map((id) => this.playerName(state, id)).join(' + '),
      teamB: match.teamB.map((id) => this.playerName(state, id)).join(' + '),
      mine,
      mySide: match.teamA.includes(playerId) ? 'A' : match.teamB.includes(playerId) ? 'B' : null,
      ifAWins,
      ifBWins,
      swing,
      better,
      forced: forcedSide,
    });
    const goals = {} as Record<GoalPlace, PathGoal>;
    for (const goal of [1, 2, 3] as GoalPlace[]) {
      const result = engine.goals[goal];
      const byId = new Map(open.map((match) => [match.id, match] as const));
      const impacts = result.matchImpacts.map((impact) =>
        toMatch(
          byId.get(impact.matchId)!,
          impact.ifAWins,
          impact.ifBWins,
          impact.swing,
          impact.better,
          impact.mine,
          forced[impact.matchId],
        ),
      );
      const copy = this.pathCopy(goal, result.status, result.probability, result.tieShare, engine, result.byMyWins);
      goals[goal] = {
        goal,
        probability: result.probability,
        status: result.status,
        tieShare: result.tieShare,
        headline: copy.headline,
        detail: copy.detail,
        tieNote: copy.tieNote,
        myMatches: impacts.filter((match) => match.mine).sort((a, b) => a.round - b.round),
        watchMatches: impacts.filter((match) => !match.mine && match.swing >= 0.01).slice(0, 4),
        rivals: result.rivals.slice(0, 3).map((rival) => ({
          playerId: rival.playerId,
          name: this.playerName(state, rival.playerId),
          position: standings.findIndex((row) => row.playerId === rival.playerId) + 1,
          gainPerLoss: Math.round(rival.gainPerLoss * 100),
          remainingMatches: rival.matches,
        })),
        byMyWins: result.byMyWins,
      };
    }
    const path: PathProjection = {
      playerId,
      playerName: player.name,
      position,
      wins: player.setsWon,
      remainingMatches: engine.myOpenMatches,
      openMatches: engine.openMatches,
      mode: engine.mode,
      expectedPlace: engine.expectedPlace,
      bestPlace: engine.bestPlace,
      worstPlace: engine.worstPlace,
      placeDistribution: engine.placeDistribution,
      goals,
      forcedMatches: forcedIds.map((match) =>
        toMatch(match, 0, 0, 0, null, [...match.teamA, ...match.teamB].includes(playerId), forced[match.id]),
      ),
    };
    if (this.pathCache.size > 40) this.pathCache.clear();
    this.pathCache.set(key, path);
    return path;
  }

  /** Chance after each completed round (replaying the results), plus "agora" when a round is half played. */
  pathHistory(state: TournamentState, playerId: string): TrendPoint[] {
    const key = `${playerId}|${this.resultsSignature(state)}`;
    const cached = this.trendCache.get(key);
    if (cached) return cached;
    const rounds = state.rounds;
    const completed = rounds.filter((round, index) =>
      rounds.slice(0, index + 1).every((item) => item.matches.every((match) => this.isPlayed(match))),
    ).length;
    const points: TrendPoint[] = [];
    const sample = (upTo: number, label: string): void => {
      const wins = new Map<string, number>(state.players.map((player) => [player.id, 0] as [string, number]));
      const open: EngineMatch[] = [];
      rounds.forEach((round, index) =>
        round.matches.forEach((match) => {
          if (index < upTo && this.isPlayed(match)) {
            const aWins = (match.scoreA as number) > (match.scoreB as number);
            for (const id of aWins ? match.teamA : match.teamB) wins.set(id, (wins.get(id) ?? 0) + 1);
          } else open.push({ id: match.id, round: round.number, teamA: match.teamA, teamB: match.teamB });
        }),
      );
      const options: EngineOptions = { simulations: 5000 };
      const result = projectScenarios(
        state.players.map((player) => ({ id: player.id, wins: wins.get(player.id) ?? 0 })),
        open,
        playerId,
        options,
      );
      points.push({
        label,
        round: upTo,
        probability: { 1: result.goals[1].probability, 2: result.goals[2].probability, 3: result.goals[3].probability },
      });
    };
    for (let k = 0; k <= completed; k++) sample(k, k === 0 ? 'Início' : `R${k}`);
    const playedMatches = rounds.reduce(
      (sum, round) => sum + round.matches.filter((match) => this.isPlayed(match)).length,
      0,
    );
    const completedMatches = rounds.slice(0, completed).reduce((sum, round) => sum + round.matches.length, 0);
    if (playedMatches > completedMatches) sample(rounds.length, 'Agora');
    if (this.trendCache.size > 40) this.trendCache.clear();
    this.trendCache.set(key, points);
    return points;
  }

  private pathCopy(
    goal: GoalPlace,
    status: GoalStatus,
    probability: number,
    tieShare: number,
    engine: EngineResult,
    byMyWins: { wins: number; probability: number }[],
  ): { headline: string; detail: string; tieNote: string } {
    const label = goal === 1 ? 'o 1º lugar' : goal === 2 ? 'o top 2' : 'o top 3';
    const tieNote =
      tieShare >= 0.05
        ? `Em ${Math.round(tieShare * 100)}% dos cenários o desempate decide: primeiro o saldo de games, depois o confronto direto.`
        : '';
    if (status === 'clinched') {
      return {
        headline: goal === 1 ? 'Primeiro lugar garantido' : `Top ${goal} garantido`,
        detail: 'Nenhum resultado dos jogos que faltam tira você dessa posição.',
        tieNote: '',
      };
    }
    if (status === 'eliminated') {
      return {
        headline: goal === 1 ? 'Fora da disputa pelo 1º lugar' : `Fora do top ${goal}`,
        detail: `A melhor colocação que você ainda pode alcançar é ${engine.bestPlace}º.`,
        tieNote: '',
      };
    }
    const mine = engine.myOpenMatches;
    let detail = 'Todos os jogos restantes foram considerados equilibrados.';
    if (mine > 0 && byMyWins.length > 1) {
      const all = byMyWins[byMyWins.length - 1];
      const none = byMyWins[0];
      const half = byMyWins.find((item) => item.probability >= 0.5);
      detail =
        half && half.wins > 0 && half.wins < mine
          ? `Com ${this.plural(half.wins, 'vitória', 'vitórias')} em ${this.plural(mine, 'jogo', 'jogos')}, sua chance passa de 50%. Vencendo todos: ${this.formatChance(all.probability)}.`
          : `Vencendo seus ${this.plural(mine, 'jogo', 'jogos')}: ${this.formatChance(all.probability)}. Perdendo todos: ${this.formatChance(none.probability)}.`;
    }
    return {
      headline: `${this.formatChance(probability)} de chance de ${goal === 1 ? 'ser campeão' : 'chegar ao top ' + goal}`,
      detail: `${detail}`.trim() || `Objetivo: ${label}.`,
      tieNote,
    };
  }

  formatChance(probability: number): string {
    if (probability <= 0) return '0%';
    if (probability < 0.01) return '<1%';
    if (probability > 0.99 && probability < 1) return '>99%';
    return `${Math.round(probability * 100)}%`;
  }

  private plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
  }
  private isPlayed(match: Match): boolean {
    return match.scoreA !== null && match.scoreB !== null;
  }

  private openMatches(state: TournamentState): EngineMatch[] {
    return state.rounds.flatMap((round) =>
      round.matches
        .filter((match) => !this.isPlayed(match))
        .map((match) => ({ id: match.id, round: round.number, teamA: match.teamA, teamB: match.teamB })),
    );
  }

  private resultsSignature(state: TournamentState): string {
    return state.rounds
      .map((round) =>
        round.matches.map((match) => (this.isPlayed(match) ? `${match.scoreA}:${match.scoreB}` : '-')).join(','),
      )
      .join('|');
  }

  private describe(
    status: QualificationStatus,
    position: number,
    wins: number,
    cutoffWins: number,
    needed: number,
    remaining: number,
    maxWins: number,
  ): { headline: string; detail: string } {
    switch (status) {
      case 'secure':
        return { headline: 'Top 3 garantido', detail: 'Nenhum rival consegue alcançar suas vit\u00f3rias.' };
      case 'out':
        return { headline: 'Fora do top 3', detail: `M\u00e1ximo poss\u00edvel: ${maxWins} vit\u00f3rias.` };
      case 'inside': {
        const lead = wins - cutoffWins;
        return {
          headline: `${position}\u00ba \u00b7 no top 3`,
          detail:
            lead > 0
              ? `${lead} vit\u00f3ria(s) \u00e0 frente do 4\u00ba.`
              : 'Empatado com o 4\u00ba: decide o saldo de games.',
        };
      }
      default:
        return needed <= remaining
          ? {
              headline: `Precisa de ${needed} de ${remaining} vit\u00f3rias`,
              detail: 'Considerando a classifica\u00e7\u00e3o atual dos rivais.',
            }
          : { headline: 'Depende dos rivais', detail: `Faltam ${needed} vit\u00f3rias e restam ${remaining} jogos.` };
    }
  }

  private remainingMatches(state: TournamentState): Map<string, number> {
    const counts = new Map<string, number>();
    for (const round of state.rounds) {
      for (const match of round.matches) {
        if (match.scoreA !== null && match.scoreB !== null) continue;
        for (const id of [...match.teamA, ...match.teamB]) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }

  private playerName(state: TournamentState, playerId: string): string {
    return state.players.find((player) => player.id === playerId)?.name ?? 'Atleta';
  }

  private ordinal(position: number): string {
    return `${position}º`;
  }
}
