import { Injectable } from '@angular/core';
import { PlayerStanding, TournamentState } from './models';

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
}
