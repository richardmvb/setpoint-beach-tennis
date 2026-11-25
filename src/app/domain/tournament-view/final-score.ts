import type { Match } from '../../core/models';

/** The games and tie-break of a match as people read them. */
export interface ShownScore {
  a: number | null;
  b: number | null;
  tieBreakA: number | null;
  tieBreakB: number | null;
}

type Scored = Pick<Match, 'scoreA' | 'scoreB' | 'tieBreakA' | 'tieBreakB'>;

/**
 * A set won in the tie-break is 7 to 6 in tennis. A final scored point by point is stored that way (7 to 6 with the
 * tie-break points), but one typed by hand is stored as 6 to 6 plus the tie-break, which reads like a draw. This
 * returns the 7 to 6 form for both, and the tie-break points only where a tie-break was played (6 to 6, 7 to 6 or
 * 6 to 7). It only changes what is shown: the stored score is not touched.
 */
export function shownScore(match: Scored): ShownScore {
  const { scoreA: a, scoreB: b } = match;
  const tieBreakA = match.tieBreakA ?? null;
  const tieBreakB = match.tieBreakB ?? null;
  if (a === null || b === null) return { a, b, tieBreakA: null, tieBreakB: null };
  const played = Math.min(a, b) === 6 && Math.max(a, b) >= 6 && Math.max(a, b) <= 7;
  if (!played || tieBreakA === null || tieBreakB === null) return { a, b, tieBreakA: null, tieBreakB: null };
  const wonA = tieBreakA >= 7 && tieBreakA - tieBreakB >= 2;
  const wonB = tieBreakB >= 7 && tieBreakB - tieBreakA >= 2;
  if (a === 6 && b === 6 && (wonA || wonB)) return { a: wonA ? 7 : 6, b: wonB ? 7 : 6, tieBreakA, tieBreakB };
  return { a, b, tieBreakA, tieBreakB };
}
