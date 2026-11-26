import type { FinalsPairing, PlayerStanding, TournamentState } from '../../core/models';
import {
  fixedPairsMode,
  groupSizeOf,
  isGroupTournament,
  mixedFinalistCount,
  usesGroupQualification,
  usesMixedFinals,
} from './format';
import { qualificationField, type QualificationField, type QualificationStatus } from './group-qualification';
import { scheduledGroupMatches } from './player-matches';
import { groupStageComplete } from './progress';
import {
  compareStandingCriteria,
  directWinsAgainstTiedPlayers,
  FINALIST_PLACES,
  openStandingTies,
  rankedStandingGroups,
  storedTieDraw,
} from './standings';

/**
 * Why an athlete holds a place: the list that decides who reaches the finals, the place in it, and what separates the
 * athlete from the neighbours. Every reason is worded so that it is always true: the rules are applied by
 * `standings.ts` and `group-qualification.ts`, and this file only finds which of their steps decided.
 */

/** The first three tie-break criteria, in order. */
type RankingCriterion = 'wins' | 'balance' | 'gamesFor';

/** Why two athletes equal on the three criteria are in this order. */
type TieReason =
  /** Wins against the other tied athletes, counted once over the whole tied set (never one opponent's name). */
  | { kind: 'headToHead'; tiedCount: number; above: number; below: number }
  /**
   * A recorded draw. Across groups the draw covers the whole tied set, and each group keeps its own order, so the
   * draw can have put the lower athlete first while the group order won (`groupOrderKept`).
   */
  | { kind: 'draw'; drawnAt: string; crossGroup: boolean; groupOrderKept: boolean }
  /** Fixed partners share every number. */
  | { kind: 'partners' }
  /** Nothing separates them yet. `needsDraw`: the order matters and the organizer will be asked to draw it. */
  | { kind: 'tied'; needsDraw: boolean };

export type Separation =
  | { kind: 'criterion'; criterion: RankingCriterion; above: number; below: number }
  /** Same group, equal criteria: the order the group itself gave, and why. */
  | { kind: 'sameGroup'; groupName: string; within: TieReason }
  /**
   * The qualification rule, not the numbers: the athlete above is in as a top-two of the group (or as a third place
   * competing for a best-third place) and the one below is not, even with equal or better numbers.
   */
  | { kind: 'qualificationRule'; abovePlace: number; belowPlace: number }
  | TieReason;

type DecidingListKind = 'qualification' | 'overall' | 'male' | 'female';

/** The list whose order decides the finals. */
export interface DecidingList {
  kind: DecidingListKind;
  entries: PlayerStanding[];
  /** How many of the first places reach the finals; null when everybody does or another list decides. */
  slots: number | null;
}

export interface RankingNeighbour {
  standing: PlayerStanding;
  /** `list`: `place` is the place in the deciding list; `group`: the place in the athlete's group. */
  scope: 'list' | 'group';
  place: number;
  /** Why the upper one of the two is above the other. */
  separation: Separation;
}

export interface PlaceExplanation {
  list: DecidingListKind;
  place: number;
  size: number;
  slots: number | null;
  /** In the places that reach the finals today; null when there is no cut. */
  inside: boolean | null;
  standing: PlayerStanding;
  /** No finals yet and the group stage still has matches without a score: the place can still change. */
  provisional: boolean;
  /** The athlete's group; `place` and `status` only in the 20-player format, where the group decides. */
  group: { name: string; place: number | null; status: QualificationStatus | null } | null;
  /** The neighbour the athlete is behind, and the one the athlete is ahead of (`separation` is always upper first). */
  above: RankingNeighbour | null;
  below: RankingNeighbour | null;
}

export function decidingList(state: TournamentState, gender?: 'male' | 'female'): DecidingList {
  if (usesGroupQualification(state)) {
    const field = qualificationField(state);
    return { kind: 'qualification', entries: raceOrder(field), slots: field.qualification.qualifiers.length };
  }
  const all = rankedStandingGroups(state).flat();
  if (usesMixedFinals(state) && gender) {
    const entries = all.filter((row) => genderOf(state, row.playerId) === gender);
    const slots = mixedFinalistCount(state);
    return { kind: gender, entries, slots: entries.length > slots ? slots : null };
  }
  return { kind: 'overall', entries: all, slots: all.length > FINALIST_PLACES ? FINALIST_PLACES : null };
}

/** Where the athlete stands and why; null before the schedule is drawn or for an unknown player. */
export function placeExplanation(state: TournamentState, playerId: string): PlaceExplanation | null {
  if (!state.rounds.length) return null;
  return usesGroupQualification(state) ? qualificationPlace(state, playerId) : overallPlace(state, playerId);
}

function overallPlace(state: TournamentState, playerId: string): PlaceExplanation | null {
  const groups = rankedStandingGroups(state);
  const all = groups.flat();
  const open = openStandingTies(state, groups, FINALIST_PLACES);
  const gender = genderOf(state, playerId);
  const { kind, entries, slots } = decidingList(state, gender);
  const index = entries.findIndex((row) => row.playerId === playerId);
  if (index < 0) return null;
  const me = entries[index];
  const partner = partnerOf(state, playerId);
  const neighbour = (step: -1 | 1): RankingNeighbour | null => {
    let at = index + step;
    while (entries[at] && entries[at].playerId === partner) at += step;
    const other = entries[at];
    if (!other) return null;
    const [upper, lower] = step < 0 ? [other, me] : [me, other];
    return { standing: other, scope: 'list', place: at + 1, separation: rankedReason(state, all, upper, lower, open) };
  };
  const groupName = (state.groups ?? []).find((group) => group.playerIds.includes(playerId))?.name;
  return {
    list: kind,
    place: index + 1,
    size: entries.length,
    slots,
    inside: slots === null ? null : index < slots,
    standing: me,
    provisional: provisional(state),
    group: isGroupTournament(state) && groupName ? { name: groupName, place: null, status: null } : null,
    above: neighbour(-1),
    below: neighbour(1),
  };
}

function qualificationPlace(state: TournamentState, playerId: string): PlaceExplanation | null {
  const field = qualificationField(state);
  const { qualification, missedThirds, others, groupOf, thirdSlots, open } = field;
  const race = raceOrder(field);
  const index = race.findIndex((row) => row.playerId === playerId);
  const group = groupOf.get(playerId);
  if (index < 0 || !group) return null;
  const me = race[index];
  const table = qualification.byGroup.find((candidate) => candidate.groupId === group.groupId)!;
  const status = table.rows.find((row) => row.standing.playerId === playerId)!.status;
  const qualifierIds = new Set(qualification.qualifiers.map((row) => row.playerId));
  const missedIds = new Set(missedThirds.map((row) => row.playerId));
  const segment = (row: PlayerStanding): PlayerStanding[] =>
    qualifierIds.has(row.playerId) ? qualification.qualifiers : missedIds.has(row.playerId) ? missedThirds : others;
  const placeOf = (row: PlayerStanding): number => groupOf.get(row.playerId)!.place;

  const reason = (upper: PlayerStanding, lower: PlayerStanding): Separation => {
    if (compareStandingCriteria(upper, lower) > 0)
      return { kind: 'qualificationRule', abovePlace: placeOf(upper), belowPlace: placeOf(lower) };
    const upperGroup = groupOf.get(upper.playerId)!;
    if (upperGroup.groupId === groupOf.get(lower.playerId)!.groupId) {
      const criterion = criterionBetween(upper, lower);
      if (criterion) return criterion;
      const rows = qualification.byGroup.find((candidate) => candidate.groupId === upperGroup.groupId)!.rows;
      const scope = rows.map((row) => row.standing);
      const within = rankedReason(state, scope, upper, lower, open);
      return within.kind === 'criterion' || within.kind === 'sameGroup' || within.kind === 'qualificationRule'
        ? within
        : { kind: 'sameGroup', groupName: upperGroup.name, within };
    }
    const upperSegment = segment(upper);
    if (upperSegment === segment(lower))
      return acrossReason(
        state,
        upperSegment === missedThirds ? qualification.thirdsRanked : upperSegment,
        upper,
        lower,
        open,
      );
    if (placeOf(upper) === 3 && placeOf(lower) === 3)
      return acrossReason(state, qualification.thirdsRanked, upper, lower, open);
    return (
      criterionBetween(upper, lower) ?? {
        kind: 'qualificationRule',
        abovePlace: placeOf(upper),
        belowPlace: placeOf(lower),
      }
    );
  };
  const listNeighbour = (at: number, upperFirst: boolean): RankingNeighbour | null => {
    const other = race[at];
    if (!other) return null;
    const separation = upperFirst ? reason(other, me) : reason(me, other);
    return { standing: other, scope: 'list', place: at + 1, separation };
  };
  const groupNeighbour = (place: number, upperFirst: boolean): RankingNeighbour | null => {
    const other = table.rows[place - 1]?.standing;
    if (!other) return null;
    const scope = table.rows.map((row) => row.standing);
    const separation = upperFirst
      ? rankedReason(state, scope, other, me, open)
      : rankedReason(state, scope, me, other, open);
    return { standing: other, scope: 'group', place, separation };
  };

  let above: RankingNeighbour | null;
  let below: RankingNeighbour | null;
  if (qualifierIds.has(playerId)) {
    above = listNeighbour(index - 1, true);
    below = listNeighbour(index + 1, false);
  } else if (missedIds.has(playerId)) {
    // A third place that missed out is compared with the last third place that got in, and the next one out.
    const lastIn = thirdSlots > 0 ? qualification.thirdsRanked[thirdSlots - 1] : undefined;
    above = lastIn
      ? {
          standing: lastIn,
          scope: 'list',
          place: race.findIndex((row) => row.playerId === lastIn.playerId) + 1,
          separation: acrossReason(state, qualification.thirdsRanked, lastIn, me, open),
        }
      : null;
    const next = missedThirds[missedThirds.indexOf(me) + 1];
    below = next ? listNeighbour(index + 1, false) : null;
  } else {
    // Fourth places and below cannot qualify: what matters is the group, so they are compared inside it.
    above = groupNeighbour(group.place - 1, true);
    below = groupNeighbour(group.place + 1, false);
  }
  const slots = qualification.qualifiers.length;
  return {
    list: 'qualification',
    place: index + 1,
    size: race.length,
    slots,
    inside: status !== 'out',
    standing: me,
    provisional: provisional(state),
    group: { name: group.name, place: group.place, status },
    above,
    below,
  };
}

/** The race to the finals: the qualifiers in seed order, then the thirds that missed out, then everyone else. */
function raceOrder(field: QualificationField): PlayerStanding[] {
  return [...field.qualification.qualifiers, ...field.missedThirds, ...field.others];
}

/** Inside one ranking (the whole field, or one group): the criteria, then head-to-head, then a draw. */
function rankedReason(
  state: TournamentState,
  scope: readonly PlayerStanding[],
  upper: PlayerStanding,
  lower: PlayerStanding,
  open: readonly PlayerStanding[][],
): Separation {
  const criterion = criterionBetween(upper, lower);
  if (criterion) return criterion;
  if (partnerOf(state, upper.playerId) === lower.playerId) return { kind: 'partners' };
  const run = scope.filter((row) => compareStandingCriteria(row, upper) === 0);
  const upperWins = directWinsAgainstTiedPlayers(state, upper.playerId, run);
  const lowerWins = directWinsAgainstTiedPlayers(state, lower.playerId, run);
  if (upperWins !== lowerWins) return { kind: 'headToHead', tiedCount: run.length, above: upperWins, below: lowerWins };
  const subset = run.filter((row) => directWinsAgainstTiedPlayers(state, row.playerId, run) === upperWins);
  const draw = storedTieDraw(state, subset);
  if (draw) return { kind: 'draw', drawnAt: draw.createdAt, crossGroup: false, groupOrderKept: false };
  return { kind: 'tied', needsDraw: open.some((tie) => sameSet(tie, subset)) };
}

/** Across groups (the 20-player format): the criteria, then a draw over the whole tied set (no head-to-head). */
function acrossReason(
  state: TournamentState,
  scope: readonly PlayerStanding[],
  upper: PlayerStanding,
  lower: PlayerStanding,
  open: readonly PlayerStanding[][],
): Separation {
  const criterion = criterionBetween(upper, lower);
  if (criterion) return criterion;
  const run = scope.filter((row) => compareStandingCriteria(row, upper) === 0);
  const draw = storedTieDraw(state, run);
  if (draw)
    return {
      kind: 'draw',
      drawnAt: draw.createdAt,
      crossGroup: true,
      groupOrderKept: draw.order.indexOf(upper.playerId) > draw.order.indexOf(lower.playerId),
    };
  return { kind: 'tied', needsDraw: open.some((tie) => sameSet(tie, run)) };
}

/** The first of the three criteria on which the two differ, or null when they are equal on all three. */
export function criterionBetween(upper: PlayerStanding, lower: PlayerStanding): Separation | null {
  if (upper.setsWon !== lower.setsWon)
    return { kind: 'criterion', criterion: 'wins', above: upper.setsWon, below: lower.setsWon };
  if (upper.gameBalance !== lower.gameBalance)
    return { kind: 'criterion', criterion: 'balance', above: upper.gameBalance, below: lower.gameBalance };
  if (upper.gamesFor !== lower.gamesFor)
    return { kind: 'criterion', criterion: 'gamesFor', above: upper.gamesFor, below: lower.gamesFor };
  return null;
}

function provisional(state: TournamentState): boolean {
  return !state.finals && !groupStageComplete(state);
}

function genderOf(state: TournamentState, playerId: string): 'male' | 'female' | undefined {
  return state.players.find((player) => player.id === playerId)?.gender;
}

function partnerOf(state: TournamentState, playerId: string): string | null {
  if (!fixedPairsMode(state)) return null;
  const pair = (state.fixedPairs ?? []).find((candidate) => candidate.includes(playerId));
  return pair ? (pair[0] === playerId ? pair[1] : pair[0]) : null;
}

function sameSet(a: readonly PlayerStanding[], b: readonly PlayerStanding[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((row) => row.playerId));
  return b.every((row) => ids.has(row.playerId));
}

/** What the "Como funciona" dialog explains, with this tournament's numbers. */
export interface RankingRules {
  /** `groups20`: the groups decide; `top`: the overall ranking decides; `mixed`: one ranking per gender decides. */
  variant: 'groups20' | 'top' | 'mixed';
  players: number;
  groupTournament: boolean;
  groupCount: number;
  groupSize: number | null;
  /** Group-stage matches each athlete plays. */
  matchesEach: number;
  /** Places in the finals (per gender in `mixed`). */
  slots: number;
  /** 20-player format: the top two of every group, and the best-third places. */
  directSlots: number;
  thirdSlots: number;
  pairing: FinalsPairing;
}

export function rankingRules(state: TournamentState): RankingRules {
  const groupCount = state.groups?.length ?? 0;
  const firstPlayer = state.players[0]?.id;
  const base = {
    players: state.players.length,
    groupTournament: isGroupTournament(state),
    groupCount,
    groupSize: isGroupTournament(state) && groupCount ? groupSizeOf(state) : null,
    matchesEach: firstPlayer ? scheduledGroupMatches(state, firstPlayer) : 0,
    pairing: state.finalsPairing ?? 'crossed',
  };
  if (usesGroupQualification(state)) {
    const directSlots = 2 * groupCount;
    return { ...base, variant: 'groups20', slots: 12, directSlots, thirdSlots: Math.max(0, 12 - directSlots) };
  }
  if (usesMixedFinals(state))
    return { ...base, variant: 'mixed', slots: mixedFinalistCount(state), directSlots: 0, thirdSlots: 0 };
  return {
    ...base,
    variant: 'top',
    slots: Math.min(FINALIST_PLACES, state.players.length),
    directSlots: 0,
    thirdSlots: 0,
  };
}
