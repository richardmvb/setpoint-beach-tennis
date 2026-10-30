import { Injectable } from '@angular/core';
import { FinalStage, Match, PlayerStanding } from './models';

export interface PodiumPlace {
  place: number;
  label: string;
  playerIds: string[];
}

@Injectable({ providedIn: 'root' })
export class FinalsService {
  create(ranking: PlayerStanding[]): FinalStage {
    if (ranking.length < 8) throw new Error('A final exige pelo menos oito jogadores no ranking.');
    const seededPlayers = ranking.slice(0, 8).map(row => row.playerId);
    const createMatch = (kind: 'championship' | 'third-place', teamA: [string, string], teamB: [string, string]): Match => ({
      id: `final-${kind}`,
      court: kind === 'championship' ? 1 : 2,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      phase: 'final',
      finalKind: kind,
      tieBreakA: null,
      tieBreakB: null
    });
    return {
      matches: [
        createMatch('championship', [seededPlayers[0], seededPlayers[2]], [seededPlayers[1], seededPlayers[3]]),
        createMatch('third-place', [seededPlayers[4], seededPlayers[6]], [seededPlayers[5], seededPlayers[7]])
      ],
      complete: false,
      podiumPlayerIds: []
    };
  }

  winnerSide(match: Match): 1 | 2 | null {
    const { scoreA, scoreB, tieBreakA, tieBreakB } = match;
    if (scoreA === 6 && scoreB === 6) {
      if (tieBreakA === null || tieBreakB === null || tieBreakA === undefined || tieBreakB === undefined) return null;
      if (tieBreakA >= 7 && tieBreakA - tieBreakB >= 2) return 1;
      if (tieBreakB >= 7 && tieBreakB - tieBreakA >= 2) return 2;
      return null;
    }
    if (scoreA === 6 && scoreB !== null && scoreB <= 4) return 1;
    if (scoreA === 7 && scoreB === 5) return 1;
    if (scoreB === 6 && scoreA !== null && scoreA <= 4) return 2;
    if (scoreB === 7 && scoreA === 5) return 2;
    return null;
  }

  updatePodium(stage: FinalStage): FinalStage {
    const championship = stage.matches.find(match => match.finalKind === 'championship');
    const thirdPlace = stage.matches.find(match => match.finalKind === 'third-place');
    if (!championship || !thirdPlace) return { ...stage, complete: false, podiumPlayerIds: [] };
    const championSide = this.winnerSide(championship);
    const thirdSide = this.winnerSide(thirdPlace);
    if (!championSide || !thirdSide) return { ...stage, complete: false, podiumPlayerIds: [] };

    const winners = (match: Match, side: 1 | 2) => side === 1 ? match.teamA : match.teamB;
    const losers = (match: Match, side: 1 | 2) => side === 1 ? match.teamB : match.teamA;
    return {
      ...stage,
      complete: true,
      podiumPlayerIds: [
        ...winners(championship, championSide),
        ...losers(championship, championSide),
        ...winners(thirdPlace, thirdSide),
        ...losers(thirdPlace, thirdSide)
      ]
    };
  }

  podium(stage: FinalStage): PodiumPlace[] {
    if (!stage.complete || stage.podiumPlayerIds.length !== 8) return [];
    return [
      { place: 1, label: 'Campeões', playerIds: stage.podiumPlayerIds.slice(0, 2) },
      { place: 2, label: 'Vice-campeões', playerIds: stage.podiumPlayerIds.slice(2, 4) },
      { place: 3, label: '3º lugar', playerIds: stage.podiumPlayerIds.slice(4, 6) },
      { place: 4, label: '4º lugar', playerIds: stage.podiumPlayerIds.slice(6, 8) }
    ];
  }
}