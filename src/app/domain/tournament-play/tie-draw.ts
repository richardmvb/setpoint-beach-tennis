import type { PlayerStanding, TournamentState } from '../../core/models';
import { usesGroupQualification } from '../tournament-view/format';
import { unresolvedQualificationTie } from '../tournament-view/group-qualification';
import { FINALIST_PLACES, openStandingTies, type StandingsView } from '../tournament-view/standings';

/**
 * The first group of players the tie-break rules could not separate among the finalists and that nobody has drawn
 * yet, or an empty list when the order is settled.
 */
export function unresolvedFinalTie(state: TournamentState, view: StandingsView): PlayerStanding[] {
  return openStandingTies(state, view.groups, FINALIST_PLACES)[0] ?? [];
}

/** The tie the generation of the finals must have drawn first: the qualification's in the 20-player format. */
export function unresolvedTie(state: TournamentState, view: StandingsView): PlayerStanding[] {
  return usesGroupQualification(state) ? unresolvedQualificationTie(state) : unresolvedFinalTie(state, view);
}

/** The places the tied players hold, in order: `[4, 5]`. */
export function tiedPositions(playerIds: readonly string[], standings: readonly PlayerStanding[]): number[] {
  return playerIds.map((id) => standings.findIndex((row) => row.playerId === id) + 1).sort((a, b) => a - b);
}

/** A random order of the ids (Fisher-Yates over an unbiased integer source). */
export function shuffledOrder(ids: readonly string[], randomInt: (maxExclusive: number) => number): string[] {
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}

/** The draw is recorded, so the ranking splits the tied players in that order from now on. */
export function withTieDraw(
  state: TournamentState,
  playerIds: readonly string[],
  order: readonly string[],
  createdAt: string,
): TournamentState {
  return {
    ...state,
    tieBreakDraws: [...(state.tieBreakDraws ?? []), { playerIds: [...playerIds].sort(), order: [...order], createdAt }],
  };
}
