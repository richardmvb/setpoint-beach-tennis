import type { Match } from '../../core/models';

/**
 * Which side won a final, or null while it is undecided. Finals can be scored point by point through the padel
 * score engine (a vendor), so the domain receives this rule instead of importing it: `FinalsService.winnerSide`.
 */
export type FinalWinnerSide = (match: Match) => 1 | 2 | null;

/** A group-stage match counts once both scores are in. */
export function isScored(match: Match): boolean {
  return match.scoreA !== null && match.scoreB !== null;
}
