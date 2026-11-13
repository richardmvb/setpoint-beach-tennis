import type { TournamentState } from '../../core/models';

export function isGroupTournament(state: TournamentState): boolean {
  return state.tournamentMode === 'groups';
}

export function isMixedDoubles(state: TournamentState): boolean {
  return state.doublesFormat === 'mixed';
}

/** Groups with pairs fixed for the whole tournament (the other group format rotates partners). */
export function fixedPairsMode(state: TournamentState): boolean {
  return isGroupTournament(state) && state.groupFormat === 'fixed';
}

/** Early mixed finals exist only for the Super 24 mixed on 3 courts. */
export function isEarlyFinalsOptionAvailable(state: TournamentState): boolean {
  return !isGroupTournament(state) && state.size === 24 && isMixedDoubles(state) && state.courts === 3;
}

export function usesMixedFinals(state: TournamentState): boolean {
  return isEarlyFinalsOptionAvailable(state) && !!state.earlyFinalsEnabled;
}

export function usesMixedFinalBracket(state: TournamentState): boolean {
  return usesMixedFinals(state) && (state.mixedFinalFormat ?? 'knockout') === 'knockout';
}

/** How many players of each gender reach the mixed finals. */
export function mixedFinalistCount(state: TournamentState): number {
  return usesMixedFinalBracket(state) ? 8 : 4;
}

/**
 * The pairs a fixed-pairs tournament starts with: in registration order, or man and woman by position in mixed
 * doubles. Empty until the roster is full (and, in mixed doubles, balanced).
 */
export function defaultFixedPairs(state: TournamentState): [string, string][] {
  if (!fixedPairsMode(state) || state.players.length !== state.size) return [];
  if (isMixedDoubles(state)) {
    const men = state.players.filter((player) => player.gender === 'male');
    const women = state.players.filter((player) => player.gender === 'female');
    if (men.length !== state.size / 2 || women.length !== state.size / 2) return [];
    return Array.from({ length: state.size / 2 }, (_, index) => [men[index]?.id ?? '', women[index]?.id ?? '']);
  }
  return Array.from({ length: state.size / 2 }, (_, index) => [
    state.players[index * 2].id,
    state.players[index * 2 + 1].id,
  ]);
}
