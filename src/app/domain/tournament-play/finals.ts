import type { PlayerStanding, TournamentState } from '../../core/models';
import { isEarlyFinalsOptionAvailable } from '../tournament-view/format';
import { isScored } from '../tournament-view/scoring';

/** Early finals: everybody has played the same number of matches, so the rounds that are left can be skipped. */
export function earlyFinalsReady(state: TournamentState, standings: readonly PlayerStanding[]): boolean {
  if (!state.earlyFinalsEnabled || !isEarlyFinalsOptionAvailable(state)) return false;
  const matchCounts = standings.map((row) => row.matchesPlayed);
  return matchCounts.length > 0 && matchCounts[0] > 0 && matchCounts.every((count) => count === matchCounts[0]);
}

/** The finals can be generated: the person may edit, the schedule is over (or the early rule holds) and none exist. */
export function canGenerateFinals(
  state: TournamentState,
  standings: readonly PlayerStanding[],
  canEdit: boolean,
): boolean {
  const scheduleComplete = state.rounds.every((round) => round.matches.every((match) => isScored(match)));
  return (
    canEdit &&
    state.rounds.length > 0 &&
    !state.finals &&
    state.players.length >= 8 &&
    (scheduleComplete || earlyFinalsReady(state, standings))
  );
}

/** The tournament is over; nothing can be edited from now on. */
export function withFinishedAt(state: TournamentState, finishedAt: string): TournamentState {
  return { ...state, finishedAt };
}
