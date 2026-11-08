import { createMatch, scorePoint, type MatchState, type Team } from '@zhuravlev-biz/padel-score-engine';

export type FinalLivePoint = Team;
export const MAX_FINAL_LIVE_POINTS = 4096;

export interface FinalLiveScore {
  gamesA: number;
  gamesB: number;
  pointsA: string;
  pointsB: string;
  tieBreak: boolean;
  tieBreakA: number | null;
  tieBreakB: number | null;
  winner: 1 | 2 | null;
}

export function finalLiveMatchScore(score: FinalLiveScore): { scoreA: number; scoreB: number; tieBreakA: number | null; tieBreakB: number | null } {
  return {
    scoreA: score.gamesA,
    scoreB: score.gamesB,
    tieBreakA: score.tieBreakA,
    tieBreakB: score.tieBreakB
  };
}

export function calculateFinalLiveScore(points: readonly FinalLivePoint[]): FinalLiveScore {
  let state: MatchState = createMatch({ sets: 3, scoringMode: 'goldenPoint', superTieBreak: false });
  let finalTieBreak: { A: number; B: number } | null = null;
  for (const point of points) {
    if ((point !== 'A' && point !== 'B') || state.score.A.sets || state.score.B.sets) {
      throw new Error('Pontuação da final inválida.');
    }
    const previousTieBreak = state.tieBreak;
    const next = scorePoint(state, point);
    if (previousTieBreak && (next.score.A.sets || next.score.B.sets)) {
      finalTieBreak = {
        A: previousTieBreak.A + (point === 'A' ? 1 : 0),
        B: previousTieBreak.B + (point === 'B' ? 1 : 0)
      };
    }
    state = { ...next, history: [] };
  }

  const winner = state.score.A.sets ? 1 : state.score.B.sets ? 2 : null;
  const tieBreak = !!state.tieBreak || !!finalTieBreak;
  const tieBreakScore = state.tieBreak ?? finalTieBreak;
  return {
    gamesA: winner ? state.score.A.setGames[0] : state.score.A.games,
    gamesB: winner ? state.score.B.setGames[0] : state.score.B.games,
    pointsA: state.tieBreak ? String(state.tieBreak.A) : state.score.A.points,
    pointsB: state.tieBreak ? String(state.tieBreak.B) : state.score.B.points,
    tieBreak,
    tieBreakA: tieBreakScore?.A ?? null,
    tieBreakB: tieBreakScore?.B ?? null,
    winner
  };
}