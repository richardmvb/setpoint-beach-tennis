import type { PlayerGender, PlayerStanding, TournamentState } from '../../core/models';
import { fixedPairsMode, mixedFinalistCount, usesGroupQualification, usesMixedFinals } from './format';
import { openQualificationTies } from './group-qualification';
import { FINALIST_PAIRS, rankedPairGroups } from './pair-standings';
import { FINALIST_PLACES, type OpenTie, openTiesIn, rankedStandingGroups, storedTieDrawOrder } from './standings';

/**
 * Every tie the finals need drawn, in the order the draw asks about them: the qualification's in the 20-player
 * format, between pairs in fixed pairs, in each gender's list for mixed finals (men first), and in the overall
 * ranking everywhere else. Ties that cannot change who reaches the finals, or their places in them, are left out.
 * `standingGroups` is the overall ranking when the caller already has it (`rankedStandingGroups`).
 */
export function openTies(state: TournamentState, standingGroups?: readonly PlayerStanding[][]): OpenTie[] {
  if (usesGroupQualification(state)) return openQualificationTies(state);
  if (fixedPairsMode(state))
    return openTiesIn(
      state,
      rankedPairGroups(state).map((group) => group.map((pair) => pair.standing)),
      FINALIST_PAIRS,
    );
  const groups = standingGroups ?? rankedStandingGroups(state);
  if (usesMixedFinals(state)) {
    const places = mixedFinalistCount(state);
    return (['male', 'female'] as const).flatMap((gender) =>
      openTiesIn(state, genderGroups(state, groups, gender), places, gender),
    );
  }
  return openTiesIn(state, groups, FINALIST_PLACES);
}

/**
 * One gender's list, as groups of players the rules could not separate. A man and a woman tied in the overall
 * ranking never compete for the same place, so each gender's share of a tie is a tie of its own. A draw made over the
 * whole tie (before the lists were drawn apart) already ordered each share.
 */
function genderGroups(
  state: TournamentState,
  groups: readonly PlayerStanding[][],
  gender: PlayerGender,
): PlayerStanding[][] {
  const genderOf = new Map(state.players.map((player) => [player.id, player.gender] as const));
  return groups.flatMap((group) => {
    const members = group.filter((row) => genderOf.get(row.playerId) === gender);
    if (!members.length) return [];
    const drawnWhole = members.length < group.length && storedTieDrawOrder(state, group) !== null;
    return drawnWhole ? members.map((row) => [row]) : [members];
  });
}
