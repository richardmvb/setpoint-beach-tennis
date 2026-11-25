import { describe, expect, it } from 'vitest';
import { shownScore } from './final-score';

const score = (scoreA: number | null, scoreB: number | null, tieBreakA: number | null, tieBreakB: number | null) =>
  shownScore({ scoreA, scoreB, tieBreakA, tieBreakB });

describe('shownScore', () => {
  it('shows a hand-typed 6-6 won in the tie-break as 7-6, from either side', () => {
    expect(score(6, 6, 7, 5)).toEqual({ a: 7, b: 6, tieBreakA: 7, tieBreakB: 5 });
    expect(score(6, 6, 8, 10)).toEqual({ a: 6, b: 7, tieBreakA: 8, tieBreakB: 10 });
  });

  it('keeps a point-by-point final, already stored as 7-6, and its tie-break', () => {
    expect(score(7, 6, 7, 5)).toEqual({ a: 7, b: 6, tieBreakA: 7, tieBreakB: 5 });
    expect(score(6, 7, 3, 7)).toEqual({ a: 6, b: 7, tieBreakA: 3, tieBreakB: 7 });
  });

  it('keeps 6-6 while the tie-break is still being played, or has no points yet', () => {
    expect(score(6, 6, 4, 3)).toEqual({ a: 6, b: 6, tieBreakA: 4, tieBreakB: 3 });
    expect(score(6, 6, 7, 6)).toEqual({ a: 6, b: 6, tieBreakA: 7, tieBreakB: 6 });
    expect(score(6, 6, null, null)).toEqual({ a: 6, b: 6, tieBreakA: null, tieBreakB: null });
    expect(score(6, 6, 5, null)).toEqual({ a: 6, b: 6, tieBreakA: null, tieBreakB: null });
  });

  it('drops a tie-break that does not belong to the games', () => {
    expect(score(6, 3, 7, 5)).toEqual({ a: 6, b: 3, tieBreakA: null, tieBreakB: null });
    expect(score(7, 5, 7, 5)).toEqual({ a: 7, b: 5, tieBreakA: null, tieBreakB: null });
  });

  it('passes an unscored match through', () => {
    expect(score(null, null, 7, 5)).toEqual({ a: null, b: null, tieBreakA: null, tieBreakB: null });
    expect(score(6, null, null, null)).toEqual({ a: 6, b: null, tieBreakA: null, tieBreakB: null });
  });
});
