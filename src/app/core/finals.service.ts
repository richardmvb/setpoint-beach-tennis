import { Injectable } from '@angular/core';
import { FinalStage, Match, PlayerStanding } from './models';
import { calculateFinalLiveScore } from './final-live-score';

export interface PodiumPlace {
  place: number;
  label: string;
  playerIds: string[];
}

@Injectable({ providedIn: 'root' })
export class FinalsService {
  create(ranking: PlayerStanding[]): FinalStage {
    if (ranking.length < 8) throw new Error('A final exige pelo menos oito jogadores no ranking.');
    const ids = ranking.slice(0, 8).map((row) => row.playerId);
    return this.stage([
      this.match('championship', 1, [ids[0], ids[2]], [ids[1], ids[3]]),
      this.match('third-place', 2, [ids[4], ids[6]], [ids[5], ids[7]]),
    ]);
  }
  createMixedBracket(men: PlayerStanding[], women: PlayerStanding[]): FinalStage {
    if (men.length < 8 || women.length < 8)
      throw new Error('A fase final mista exige oito homens e oito mulheres no ranking.');
    const pair = (index: number): [string, string] => [men[index].playerId, women[index].playerId];
    return this.stage([
      this.match('quarterfinal', 1, pair(0), pair(7), 'qf-1'),
      this.match('quarterfinal', 2, pair(3), pair(4), 'qf-2'),
      this.match('quarterfinal', 3, pair(1), pair(6), 'qf-3'),
      this.match('quarterfinal', 4, pair(2), pair(5), 'qf-4'),
      this.match('semifinal', 1, ['', ''], ['', ''], 'sf-1'),
      this.match('semifinal', 2, ['', ''], ['', ''], 'sf-2'),
      this.match('championship', 1, ['', ''], ['', '']),
      this.match('third-place', 2, ['', ''], ['', '']),
    ]);
  }
  createMixedDirect(men: PlayerStanding[], women: PlayerStanding[]): FinalStage {
    if (men.length < 4 || women.length < 4)
      throw new Error('A final mista direta exige quatro homens e quatro mulheres no ranking.');
    const pair = (index: number): [string, string] => [men[index].playerId, women[index].playerId];
    return this.stage([
      this.match('championship', 1, pair(0), pair(1)),
      this.match('third-place', 2, pair(2), pair(3)),
    ]);
  }
  winnerSide(match: Match): 1 | 2 | null {
    const { scoreA, scoreB, tieBreakA, tieBreakB } = match;
    if (!match.teamA[0] || !match.teamB[0]) return null;
    if (match.finalKind === 'championship' && match.livePoints !== undefined) {
      try {
        return calculateFinalLiveScore(match.livePoints).winner;
      } catch {
        return null;
      }
    }
    if (scoreA === 6 && scoreB === 6) {
      if (tieBreakA == null || tieBreakB == null) return null;
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
    const matches = stage.matches.map((match) => ({
      ...match,
      teamA: [...match.teamA] as [string, string],
      teamB: [...match.teamB] as [string, string],
    }));
    const byId = new Map(matches.map((match) => [match.id, match]));
    const q = ['final-qf-1', 'final-qf-2', 'final-qf-3', 'final-qf-4'].map((id) => byId.get(id));
    if (q.every(Boolean)) {
      this.setTeams(byId.get('final-sf-1')!, this.winners(q[0]!), this.winners(q[1]!));
      this.setTeams(byId.get('final-sf-2')!, this.winners(q[2]!), this.winners(q[3]!));
      const a = byId.get('final-sf-1')!,
        b = byId.get('final-sf-2')!;
      this.setTeams(byId.get('final-championship')!, this.winners(a), this.winners(b));
      this.setTeams(byId.get('final-third-place')!, this.losers(a), this.losers(b));
    }
    const final = byId.get('final-championship'),
      third = byId.get('final-third-place');
    const fs = final && this.winnerSide(final),
      ts = third && this.winnerSide(third);
    return {
      matches,
      complete: !!fs && !!ts,
      podiumPlayerIds:
        fs && ts && final && third
          ? [...this.side(final, fs), ...this.other(final, fs), ...this.side(third, ts), ...this.other(third, ts)]
          : [],
    };
  }
  podium(stage: FinalStage): PodiumPlace[] {
    if (!stage.complete || stage.podiumPlayerIds.length !== 8) return [];
    return [
      { place: 1, label: 'Campeões', playerIds: stage.podiumPlayerIds.slice(0, 2) },
      { place: 2, label: 'Vice-campeões', playerIds: stage.podiumPlayerIds.slice(2, 4) },
      { place: 3, label: '3º lugar', playerIds: stage.podiumPlayerIds.slice(4, 6) },
      { place: 4, label: '4º lugar', playerIds: stage.podiumPlayerIds.slice(6, 8) },
    ];
  }
  private stage(matches: Match[]): FinalStage {
    return { matches, complete: false, podiumPlayerIds: [] };
  }
  private match(
    kind: NonNullable<Match['finalKind']>,
    court: number,
    teamA: [string, string],
    teamB: [string, string],
    suffix: string = kind,
  ): Match {
    return {
      id: 'final-' + suffix,
      court,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      phase: 'final',
      finalKind: kind,
      tieBreakA: null,
      tieBreakB: null,
    };
  }
  private side(match: Match, side: 1 | 2): [string, string] {
    return side === 1 ? match.teamA : match.teamB;
  }
  private other(match: Match, side: 1 | 2): [string, string] {
    return side === 1 ? match.teamB : match.teamA;
  }
  private winners(match: Match): [string, string] {
    const side = this.winnerSide(match);
    return side ? this.side(match, side) : ['', ''];
  }
  private losers(match: Match): [string, string] {
    const side = this.winnerSide(match);
    return side ? this.other(match, side) : ['', ''];
  }
  private setTeams(match: Match, a: [string, string], b: [string, string]): void {
    if (match.teamA.join('|') === a.join('|') && match.teamB.join('|') === b.join('|')) return;
    match.teamA = a;
    match.teamB = b;
    match.scoreA = null;
    match.scoreB = null;
    match.tieBreakA = null;
    match.tieBreakB = null;
    delete match.livePoints;
  }
}
