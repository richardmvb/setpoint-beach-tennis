import { Injectable } from '@angular/core';
import { Match, PlayerStanding, TournamentState } from './models';

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

export interface GoalThreat {
  playerId: string;
  name: string;
  position: number;
  wins: number;
  remainingMatches: number;
  lossesNeeded: number;
}

export interface GoalKeyMatch {
  id: string;
  round: number;
  teamA: string;
  teamB: string;
  guidance: string;
  direct: boolean;
}

export interface GoalProjection {
  playerId: string;
  playerName: string;
  goalPlace: number;
  position: number;
  wins: number;
  remainingMatches: number;
  remainingGames: number;
  winsNeeded: number;
  bestPossibleWins: number;
  alreadyInGoal: boolean;
  canReachAlone: boolean;
  headline: string;
  guidance: string;
  threats: GoalThreat[];
  keyMatches: GoalKeyMatch[];
}

const TOP_PLACES = 3;

@Injectable({ providedIn: 'root' })
export class QualificationService {
  // Projeção sobre a classificação atual; empate em vitórias é decidido pelo saldo de games.
  compute(state: TournamentState, standings: PlayerStanding[]): QualificationRow[] {
    if (standings.length <= TOP_PLACES) return [];
    const remaining = this.remainingMatches(state);
    return standings.map((row, index) => {
      const others = standings.filter(item => item.playerId !== row.playerId);
      const cutoff = others[TOP_PLACES - 1];
      const remainingMatches = remaining.get(row.playerId) ?? 0;
      const maxWins = row.setsWon + remainingMatches;
      const ahead = others.filter(item => item.setsWon > maxWins).length;
      const canReach = others.filter(item => item.setsWon + (remaining.get(item.playerId) ?? 0) >= row.setsWon).length;
      const position = index + 1;

      let status: QualificationStatus = position <= TOP_PLACES ? 'inside' : 'chance';
      if (ahead >= TOP_PLACES) status = 'out';
      else if (canReach < TOP_PLACES) status = 'secure';

      const needed = Math.max(0, cutoff.setsWon - row.setsWon + 1);
      const winsNeeded = status === 'chance' ? needed : null;
      const { headline, detail } = this.describe(status, position, row.setsWon, cutoff.setsWon, needed, remainingMatches, maxWins);
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
        detail
      };
    });
  }

  projectGoal(
    state: TournamentState,
    standings: PlayerStanding[],
    playerId: string,
    goalPlace: number
  ): GoalProjection | null {
    const player = standings.find(row => row.playerId === playerId);
    if (!player || standings.length <= 1) return null;

    const normalizedGoal = Math.max(1, Math.min(3, Math.floor(goalPlace)));
    const remaining = this.remainingMatches(state);
    const remainingMatches = remaining.get(playerId) ?? 0;
    const bestPossibleWins = player.setsWon + remainingMatches;
    const rivals = standings.filter(row => row.playerId !== playerId);
    const cutoff = rivals[Math.min(normalizedGoal - 1, rivals.length - 1)];
    const winsNeeded = Math.max(0, cutoff.setsWon + 1 - player.setsWon);
    const position = standings.findIndex(row => row.playerId === playerId) + 1;

    const threats = standings
      .filter((row, index) => row.playerId !== playerId && index < normalizedGoal + 2)
      .map(row => {
        const rivalRemaining = remaining.get(row.playerId) ?? 0;
        const maxAllowedWins = bestPossibleWins - row.setsWon - 1;
        return {
          playerId: row.playerId,
          name: row.name,
          position: standings.findIndex(item => item.playerId === row.playerId) + 1,
          wins: row.setsWon,
          remainingMatches: rivalRemaining,
          lossesNeeded: Math.max(0, rivalRemaining - maxAllowedWins)
        };
      })
      .filter(threat => threat.remainingMatches > 0 && threat.lossesNeeded > 0);

    const threatById = new Map(threats.map(threat => [threat.playerId, threat]));
    const keyMatches = state.rounds.flatMap(round => round.matches)
      .filter(match => match.scoreA === null || match.scoreB === null)
      .map(match => {
        const direct = match.teamA.includes(playerId) || match.teamB.includes(playerId);
        const involvedThreats = [...match.teamA, ...match.teamB]
          .map(id => threatById.get(id)).filter((threat): threat is GoalThreat => !!threat);
        if (!direct && !involvedThreats.length) return null;
        return {
          id: match.id,
          round: state.rounds.find(round => round.matches.some(item => item.id === match.id))?.number ?? 0,
          teamA: match.teamA.map(id => this.playerName(state, id)).join(' + '),
          teamB: match.teamB.map(id => this.playerName(state, id)).join(' + '),
          guidance: direct
            ? 'Vencer este confronto direto ajuda a alcançar sua meta.'
            : involvedThreats.map(threat => `Uma derrota de ${threat.name} ajuda sua projeção.`).join(' '),
          direct
        };
      })
      .filter((match): match is GoalKeyMatch => !!match)
      .sort((a, b) => Number(b.direct) - Number(a.direct) || a.round - b.round)
      .slice(0, 5);

    const alreadyInGoal = position <= normalizedGoal;
    const canReachAlone = winsNeeded <= remainingMatches;
    const headline = alreadyInGoal
      ? `Você está no objetivo: ${position}º lugar.`
      : canReachAlone
        ? `Vença pelo menos ${winsNeeded} de ${remainingMatches} jogos.`
        : 'Você depende também de resultados dos rivais.';
    const guidance = alreadyInGoal
      ? `Para manter o ${this.ordinal(normalizedGoal)} lugar, acompanhe os rivais abaixo.`
      : canReachAlone
        ? `Com ${winsNeeded} vitória(s), você supera a projeção atual do ${this.ordinal(normalizedGoal)} lugar.`
        : `Mesmo vencendo seus ${remainingMatches} jogos, você precisa que rivais diretos percam partidas.`;

    return {
      playerId,
      playerName: player.name,
      goalPlace: normalizedGoal,
      position,
      wins: player.setsWon,
      remainingMatches,
      remainingGames: remainingMatches * state.gamesToWin,
      winsNeeded,
      bestPossibleWins,
      alreadyInGoal,
      canReachAlone,
      headline,
      guidance,
      threats,
      keyMatches
    };
  }

  private describe(
    status: QualificationStatus, position: number, wins: number, cutoffWins: number,
    needed: number, remaining: number, maxWins: number
  ): { headline: string; detail: string } {
    switch (status) {
      case 'secure': return { headline: 'Top 3 garantido', detail: 'Nenhum rival consegue alcançar suas vit\u00f3rias.' };
      case 'out': return { headline: 'Fora do top 3', detail: `M\u00e1ximo poss\u00edvel: ${maxWins} vit\u00f3rias.` };
      case 'inside': {
        const lead = wins - cutoffWins;
        return { headline: `${position}\u00ba \u00b7 no top 3`, detail: lead > 0 ? `${lead} vit\u00f3ria(s) \u00e0 frente do 4\u00ba.` : 'Empatado com o 4\u00ba: decide o saldo de games.' };
      }
      default:
        return needed <= remaining
          ? { headline: `Precisa de ${needed} de ${remaining} vit\u00f3rias`, detail: 'Considerando a classifica\u00e7\u00e3o atual dos rivais.' }
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
    return state.players.find(player => player.id === playerId)?.name ?? 'Atleta';
  }

  private ordinal(position: number): string { return `${position}º`; }
}
