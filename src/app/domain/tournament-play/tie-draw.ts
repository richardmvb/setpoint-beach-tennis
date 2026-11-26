import type { TournamentState } from '../../core/models';
import { openTies } from '../tournament-view/open-ties';
import type { OpenTie, StandingsView } from '../tournament-view/standings';

/**
 * The next tie the generation of the finals must have drawn first, or null when the order is settled: the
 * qualification's in the 20-player format, between pairs in fixed pairs, in each gender's list for mixed finals, and
 * among the finalists everywhere else (see `openTies`).
 */
export function nextOpenTie(state: TournamentState, view: StandingsView): OpenTie | null {
  return openTies(state, view.groups)[0] ?? null;
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
