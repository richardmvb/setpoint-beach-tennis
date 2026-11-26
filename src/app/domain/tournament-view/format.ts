import type { GroupSize, TournamentState } from '../../core/models';

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

/** The 20-player rotating open groups: group standings, best third places and a bracket with byes. */
export function usesGroupQualification(state: TournamentState): boolean {
  return isGroupTournament(state) && !fixedPairsMode(state) && !isMixedDoubles(state) && state.size === 20;
}

/**
 * The ranking board (the groups as cards and one list with a cut line) is how every group tournament is ranked: the
 * finals take the first places of one list of athletes, whatever the groups, so the list is what matters. In fixed
 * pairs the groups hold pairs, and the list is still of athletes (the finals take the best 8 athletes).
 */
export function usesRankingBoard(state: TournamentState): boolean {
  return isGroupTournament(state);
}

/** Players per group: 5 only in the 20-player format when chosen, 4 everywhere else. */
export function groupSizeOf(state: TournamentState): GroupSize {
  return usesGroupQualification(state) && state.groupSize === 5 ? 5 : 4;
}

/**
 * The 20-player format with fewer courts than group matches per round: the matches are all drawn, but a round does
 * not fit the courts, so people wait and the organizer plays them in any order. Court numbers mean nothing then.
 */
export function usesCourtQueue(state: TournamentState): boolean {
  return usesGroupQualification(state) && state.courts < 20 / groupSizeOf(state);
}

/** What analytics learns about the 20-player format (enums and counts only); nothing for the other formats. */
export function groupFormatProperties(state: TournamentState): { group_size?: number; finals_pairing?: string } {
  return usesGroupQualification(state)
    ? { group_size: groupSizeOf(state), finals_pairing: state.finalsPairing ?? 'crossed' }
    : {};
}
