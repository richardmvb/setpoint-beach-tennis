import type { Match } from '../../core/models';
import type { FinalWinnerSide } from '../tournament-view/scoring';

/** What someone has typed for a match: both numbers, either may be missing (an empty field is `null`). */
export interface ScoreDraft {
  a: number | null;
  b: number | null;
}

/** A group-stage score counts when it is whole, in range, not a tie, and one side reached the games to win. */
export function isValidRoundScore(a: number | null, b: number | null, gamesToWin: number): boolean {
  return (
    a !== null &&
    b !== null &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    b >= 0 &&
    a <= gamesToWin &&
    b <= gamesToWin &&
    a !== b &&
    Math.max(a, b) === gamesToWin
  );
}

/** What the line under a round's match says. The template maps each to its text. */
export type RoundScoreStatus = 'fillBoth' | 'invalid' | 'saved' | 'updating';

export function roundScoreStatus(draft: ScoreDraft, match: Match, gamesToWin: number): RoundScoreStatus {
  if (draft.a === null || draft.b === null) return 'fillBoth';
  if (!isValidRoundScore(draft.a, draft.b, gamesToWin)) return 'invalid';
  return match.scoreA === draft.a && match.scoreB === draft.b ? 'saved' : 'updating';
}

/** What the line under a final's match says. */
export type FinalScoreStatus = 'resultSaved' | 'tieBreak' | 'enterGames' | 'inProgress';

export function finalScoreStatus(match: Match, winnerSide: FinalWinnerSide): FinalScoreStatus {
  if (winnerSide(match)) return 'resultSaved';
  if (match.scoreA === 6 && match.scoreB === 6) return 'tieBreak';
  if (match.scoreA === null || match.scoreB === null) return 'enterGames';
  return 'inProgress';
}
