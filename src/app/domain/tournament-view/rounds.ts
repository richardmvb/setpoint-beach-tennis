import type { Round, TournamentState } from '../../core/models';
import { isScored } from './scoring';

/**
 * The rounds a viewer sees. When early mixed finals ended the group stage, the matches that were never played are
 * hidden, along with rounds left empty.
 */
export function viewerRounds(state: TournamentState): Round[] {
  if (!state.finishedAt || !state.earlyFinalsEnabled) return state.rounds;
  return state.rounds
    .map((round) => ({ ...round, matches: round.matches.filter((match) => isScored(match)) }))
    .filter((round) => round.matches.length > 0);
}

/** The round on court: the first one with a pending match. Null once every round is played. */
export function spotlightRound(rounds: Round[]): Round | null {
  return rounds.find((round) => round.matches.some((match) => !isScored(match))) ?? null;
}

/** Every round except the one on court. */
export function historyRounds(rounds: Round[], spotlight: Round | null): Round[] {
  return rounds.filter((round) => round !== spotlight);
}
