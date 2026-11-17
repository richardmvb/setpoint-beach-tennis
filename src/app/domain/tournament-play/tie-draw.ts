import type { PlayerStanding, TournamentState } from '../../core/models';
import { storedTieDrawOrder, type StandingsView } from '../tournament-view/standings';

/** How many of the top places the finals use: a tie that only touches places after the 8th does not matter. */
const FINALIST_PLACES = 8;

/**
 * The first group of players the tie-break rules could not separate among the finalists and that nobody has drawn
 * yet, or an empty list when the order is settled.
 */
export function unresolvedFinalTie(state: TournamentState, view: StandingsView): PlayerStanding[] {
  let position = 0;
  for (const tiedPlayers of view.groups) {
    if (tiedPlayers.length > 1 && position < FINALIST_PLACES && storedTieDrawOrder(state, tiedPlayers) === null)
      return tiedPlayers;
    position += tiedPlayers.length;
  }
  return [];
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
