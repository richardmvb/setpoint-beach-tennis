import type { PlayerStanding, TournamentGroup, TournamentState } from '../../core/models';
import { compareStandingCriteria, rankedStandingGroups, storedTieDrawOrder } from './standings';

/** The 20-player format sends 12 athletes to the finals: the top two of every group plus the best third places. */
const QUALIFIERS = 12;
const DIRECT_PER_GROUP = 2;
/** The first places of a group whose order can change who qualifies or how they are seeded. */
const PLACES_THAT_MATTER = 3;

export type QualificationStatus = 'direct' | 'bestThird' | 'out';

interface GroupStandingRow {
  standing: PlayerStanding;
  /** 1-based place in the group. */
  position: number;
  status: QualificationStatus;
}

interface GroupStandingsTable {
  groupId: string;
  name: string;
  rows: GroupStandingRow[];
}

export interface GroupQualification {
  byGroup: GroupStandingsTable[];
  /** The third places of the groups, best first. */
  thirdsRanked: PlayerStanding[];
  /** The qualified athletes in seed order: one ranking over the whole field. */
  qualifiers: PlayerStanding[];
  seeding: string[];
}

interface Run {
  start: number;
  players: PlayerStanding[];
  drawn: boolean;
}

interface Analysis {
  qualification: GroupQualification;
  unresolved: PlayerStanding[];
}

/** One group's table: sets won, game balance, games won, then head-to-head, then a recorded draw. */
function groupStandings(state: TournamentState, group: TournamentGroup): PlayerStanding[][] {
  const ids = new Set(group.playerIds);
  return rankedStandingGroups({ ...state, players: state.players.filter((player) => ids.has(player.id)) });
}

export function groupQualification(state: TournamentState): GroupQualification {
  return analyse(state).qualification;
}

/**
 * The first group of athletes that the rules could not separate, where the order changes the outcome, and that
 * nobody has drawn yet; empty when everything is settled. Looks at, in this order: the top places of each group,
 * the cut among third places, and the single ranking of the qualifiers.
 */
export function unresolvedQualificationTie(state: TournamentState): PlayerStanding[] {
  return analyse(state).unresolved;
}

/** Where a tie that blocks the qualification sits, for the words of the tie draw. */
export type QualificationTie =
  { kind: 'group'; groupName: string; positions: number[] } | { kind: 'thirds' } | { kind: 'seeding' };

export function describeQualificationTie(state: TournamentState, tied: readonly PlayerStanding[]): QualificationTie {
  const ids = new Set(tied.map((row) => row.playerId));
  const { byGroup } = analyse(state).qualification;
  const rowsOf = (table: GroupStandingsTable) => table.rows.filter((row) => ids.has(row.standing.playerId));
  const table = byGroup.find((candidate) => rowsOf(candidate).length === ids.size);
  if (table) return { kind: 'group', groupName: table.name, positions: rowsOf(table).map((row) => row.position) };
  const allThirds = byGroup.every((candidate) =>
    rowsOf(candidate).every((row) => row.position === DIRECT_PER_GROUP + 1),
  );
  return { kind: allThirds ? 'thirds' : 'seeding' };
}

function analyse(state: TournamentState): Analysis {
  const groups = state.groups ?? [];
  let unresolved: PlayerStanding[] = [];
  const settle = (tied: PlayerStanding[]): void => {
    if (!unresolved.length) unresolved = tied;
  };

  const orders = new Map<string, PlayerStanding[]>();
  const groupOf = new Map<string, string>();
  const positionOf = new Map<string, number>();
  for (const group of groups) {
    const ranking = groupStandings(state, group);
    let position = 0;
    for (const tied of ranking) {
      if (tied.length > 1 && position < PLACES_THAT_MATTER && storedTieDrawOrder(state, tied) === null) settle(tied);
      position += tied.length;
    }
    const flat = ranking.flat();
    orders.set(group.id, flat);
    flat.forEach((row, index) => {
      groupOf.set(row.playerId, group.id);
      positionOf.set(row.playerId, index + 1);
    });
  }

  const direct = groups.flatMap((group) => orders.get(group.id)!.slice(0, DIRECT_PER_GROUP));
  const thirds = groups.flatMap((group) => orders.get(group.id)!.slice(DIRECT_PER_GROUP, DIRECT_PER_GROUP + 1));
  const thirdSlots = Math.max(0, QUALIFIERS - DIRECT_PER_GROUP * groups.length);
  const rankedThirds = rankAcross(state, thirds, groupOf, positionOf);
  if (thirdSlots < thirds.length) {
    const straddling = rankedThirds.runs.find(
      (run) => !run.drawn && run.start < thirdSlots && run.start + run.players.length > thirdSlots,
    );
    if (straddling) settle(straddling.players);
  }
  const bestThirds = rankedThirds.order.slice(0, thirdSlots);

  const seeding = rankAcross(state, [...direct, ...bestThirds], groupOf, positionOf);
  const undrawn = seeding.runs.find((run) => !run.drawn);
  if (undrawn) settle(undrawn.players);

  const bestThirdIds = new Set(bestThirds.map((row) => row.playerId));
  const directIds = new Set(direct.map((row) => row.playerId));
  const byGroup = groups.map((group): GroupStandingsTable => ({
    groupId: group.id,
    name: group.name,
    rows: orders.get(group.id)!.map((standing, index) => ({
      standing,
      position: index + 1,
      status: directIds.has(standing.playerId) ? 'direct' : bestThirdIds.has(standing.playerId) ? 'bestThird' : 'out',
    })),
  }));
  return {
    qualification: {
      byGroup,
      thirdsRanked: rankedThirds.order,
      qualifiers: seeding.order,
      seeding: seeding.order.map((row) => row.playerId),
    },
    unresolved,
  };
}

/**
 * One ranking over athletes of different groups: the standing criteria, then a recorded draw for the athletes still
 * tied. Athletes of the same group keep the order their group gave them, whatever the draw says.
 * `runs` lists each set of athletes the criteria could not separate across groups, and whether a draw settled it.
 */
function rankAcross(
  state: TournamentState,
  rows: PlayerStanding[],
  groupOf: Map<string, string>,
  positionOf: Map<string, number>,
): { order: PlayerStanding[]; runs: Run[] } {
  const sorted = [...rows].sort((a, b) => compareStandingCriteria(a, b) || a.name.localeCompare(b.name));
  const order: PlayerStanding[] = [];
  const runs: Run[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index + 1;
    while (end < sorted.length && compareStandingCriteria(sorted[index], sorted[end]) === 0) end++;
    const run = sorted.slice(index, end);
    if (run.length > 1 && new Set(run.map((row) => groupOf.get(row.playerId))).size > 1) {
      const draw = storedTieDrawOrder(state, run);
      const drawn = draw ? [...run].sort((a, b) => draw.indexOf(a.playerId) - draw.indexOf(b.playerId)) : run;
      order.push(...keepGroupOrder(drawn, groupOf, positionOf));
      runs.push({ start: index, players: run, drawn: draw !== null });
    } else {
      order.push(...[...run].sort((a, b) => (positionOf.get(a.playerId) ?? 0) - (positionOf.get(b.playerId) ?? 0)));
    }
    index = end;
  }
  return { order, runs };
}

/** Reassigns the slots held by each group's athletes so they stay in their group order. */
function keepGroupOrder(
  rows: PlayerStanding[],
  groupOf: Map<string, string>,
  positionOf: Map<string, number>,
): PlayerStanding[] {
  const result = [...rows];
  for (const groupId of new Set(rows.map((row) => groupOf.get(row.playerId)))) {
    const slots = rows.flatMap((row, index) => (groupOf.get(row.playerId) === groupId ? [index] : []));
    const members = slots
      .map((slot) => rows[slot])
      .sort((a, b) => (positionOf.get(a.playerId) ?? 0) - (positionOf.get(b.playerId) ?? 0));
    slots.forEach((slot, index) => (result[slot] = members[index]));
  }
  return result;
}
