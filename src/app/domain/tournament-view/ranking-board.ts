import type { PlayerGender, PlayerStanding, TournamentState } from '../../core/models';
import { usesGroupQualification, usesRankingBoard } from './format';
import { qualificationField, type QualificationStatus } from './group-qualification';
import { FINALIST_PAIRS, fixedPairsOf, rankedPairGroups } from './pair-standings';
import { scheduledGroupMatches } from './player-matches';
import { groupStageComplete } from './progress';
import { decidingList } from './ranking-explanation';
import { isScored } from './scoring';
import { FINALIST_PLACES, openStandingTies, rankedStandingGroups } from './standings';

/**
 * One athlete of the board, with what the mini group cards and the cut list show. In a fixed pairs tournament an
 * entry is a pair, in the groups and in the list alike: `name` joins both names, `playerId` is the first partner (who
 * opens when tapped, and stands for the pair) and `playerIds` has both.
 */
export interface BoardEntry {
  playerId: string;
  playerIds: string[];
  name: string;
  /** An athlete's gender (mixed doubles show it); null for a pair. */
  gender: PlayerGender | null;
  setsWon: number;
  gameBalance: number;
  matchesPlayed: number;
  /** Group-stage matches the athlete is scheduled for. */
  scheduled: number;
  /** Place in the list that decides the finals (1-based). */
  place: number;
  /** The group's short name: "A" for "Grupo A". */
  group: string;
  /** 20-player format: the place inside the group. */
  groupPlace: number | null;
  /** 20-player format, once every group match has a score: does the athlete reach the finals. */
  status: QualificationStatus | null;
  /** Tied with others across the cut line, and nobody has drawn it yet: the draw decides who goes on. */
  tied: boolean;
}

/** A set of athletes the rules cannot separate, some inside the cut and some outside: they compete for `spots` places. */
export interface CutTie {
  count: number;
  spots: number;
}

export interface BoardGroup {
  id: string;
  name: string;
  entries: BoardEntry[];
}

/** The ranking of a group tournament as the board shows it: the groups, and one list of athletes with a cut line. */
export interface RankingBoard {
  /** Fixed pairs: the groups and the list are of pairs, and the best four go to the finals. */
  pairs: boolean;
  /** `qualification`: the groups decide who goes on (20 players); `overall`: the overall ranking decides (the rest). */
  kind: 'qualification' | 'overall';
  groups: BoardGroup[];
  /** Every athlete in the order of the race to the finals. */
  list: BoardEntry[];
  /** How many places reach the finals: the cut line is after this many rows. */
  slots: number;
  /** Every group match has a score. */
  settled: boolean;
  /** No finals yet and the group stage is still open: the order changes with every score. */
  provisional: boolean;
  /** The finals exist and the group stage is over: the board folds into one row under the finals. */
  folded: boolean;
  leaderName: string;
  /** Group-stage matches with a score, and all of them. */
  matchesDone: number;
  matchesTotal: number;
  /** 20-player format: the places for the top two of every group, and for the best third places. 0 otherwise. */
  directSlots: number;
  thirdSlots: number;
  /** 20-player format: everybody by the plain standings (the groups do not decide it); null otherwise, where `list` is it. */
  individual: BoardEntry[] | null;
  /** Ties across the cut line that still need a draw; empty while the group stage is open (the order still moves). */
  cutTies: CutTie[];
}

/** What the viewer's own line says: where one athlete stands today. */
export interface BoardViewer {
  entry: BoardEntry;
  /** Inside the places that go to the finals today. */
  inside: boolean;
  /** 20-player format: a top-two place of the group, a best third place, or out; null for 24. */
  how: 'direct' | 'bestThird' | 'out' | null;
  matchesLeft: number;
}

/** The short name of a group: the last word of its name ("Grupo A" gives "A"). */
function groupShortName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** The board of a group tournament; null for the other formats and before the schedule exists. */
export function rankingBoard(state: TournamentState): RankingBoard | null {
  if (!usesRankingBoard(state) || !state.rounds.length || !state.groups?.length) return null;
  const { entries, slots, pairs } = decidingList(state);
  const settled = groupStageComplete(state);
  const field = usesGroupQualification(state) ? qualificationField(state) : null;
  const statuses = new Map(
    (field?.qualification.byGroup ?? []).flatMap((table) =>
      table.rows.map((row) => [row.standing.playerId, row.status] as const),
    ),
  );
  const groupNames = new Map(state.groups.map((group) => [group.id, group.name]));
  const groupIdOf = new Map(state.groups.flatMap((group) => group.playerIds.map((id) => [id, group.id] as const)));
  const places = new Map(entries.map((row, index) => [row.playerId, index + 1] as const));
  const total = slots ?? entries.length;

  // Athletes the rules cannot separate, with some inside the cut and some outside, and no draw yet: the list shows
  // them in name order, but the draw decides. Only once the group stage is over; before that everybody is tied.
  const pairGroups = rankedPairGroups(state).map((group) => group.map((pair) => pair.standing));
  const openTies = field
    ? field.open
    : pairs
      ? openStandingTies(state, pairGroups, FINALIST_PAIRS)
      : openStandingTies(state, rankedStandingGroups(state), FINALIST_PLACES);
  const cutTies: { ids: string[]; spots: number }[] = settled
    ? openTies.flatMap((tie) => {
        const tiePlaces = tie.map((row) => places.get(row.playerId) ?? 0);
        const inside = tiePlaces.filter((place) => place <= total).length;
        return inside > 0 && inside < tie.length ? [{ ids: tie.map((row) => row.playerId), spots: inside }] : [];
      })
    : [];
  const tiedIds = new Set(cutTies.flatMap((tie) => tie.ids));

  const genders = new Map(state.players.map((player) => [player.id, player.gender ?? null] as const));
  const pairOf = new Map(fixedPairsOf(state).map((pair) => [pair[0], pair] as const));
  const entryOf = (row: PlayerStanding): BoardEntry => {
    const groupId = groupIdOf.get(row.playerId) ?? '';
    return {
      playerId: row.playerId,
      playerIds: pairs ? [...(pairOf.get(row.playerId) ?? [row.playerId])] : [row.playerId],
      name: row.name,
      gender: pairs ? null : (genders.get(row.playerId) ?? null),
      setsWon: row.setsWon,
      gameBalance: row.gameBalance,
      matchesPlayed: row.matchesPlayed,
      scheduled: scheduledGroupMatches(state, row.playerId),
      place: places.get(row.playerId) ?? 0,
      group: groupShortName(groupNames.get(groupId) ?? ''),
      groupPlace: field?.groupOf.get(row.playerId)?.place ?? null,
      status: settled ? (statuses.get(row.playerId) ?? null) : null,
      tied: tiedIds.has(row.playerId),
    };
  };
  const byId = new Map(entries.map((row) => [row.playerId, entryOf(row)] as const));
  const list = entries.map((row) => byId.get(row.playerId)!);

  const groups = state.groups.map((group): BoardGroup => {
    // In fixed pairs a group lists its pairs (each is one entry of the list); otherwise its athletes.
    const ids = pairs ? (group.fixedPairs ?? []).map((pair) => pair[0]) : group.playerIds;
    const members = ids.map((id) => byId.get(id)).filter((entry): entry is BoardEntry => !!entry);
    // The 20-player format orders a group by its own rules (head-to-head, draws); the others follow the overall place.
    members.sort((a, b) => (a.groupPlace ?? a.place) - (b.groupPlace ?? b.place));
    return { id: group.id, name: group.name, entries: members };
  });

  const directSlots = field ? Math.min(total, 2 * state.groups.length) : 0;
  const matches = state.rounds.flatMap((round) => round.matches);
  const individual = field
    ? rankedStandingGroups(state)
        .flat()
        .map((row, index) => ({ ...byId.get(row.playerId)!, place: index + 1, tied: false }))
    : null;

  return {
    pairs,
    kind: field ? 'qualification' : 'overall',
    groups,
    list,
    slots: total,
    matchesDone: matches.filter(isScored).length,
    matchesTotal: matches.length,
    directSlots,
    thirdSlots: field ? total - directSlots : 0,
    individual,
    cutTies: cutTies.map((tie) => ({ count: tie.ids.length, spots: tie.spots })),
    settled,
    provisional: !state.finals && !settled,
    folded: !!state.finals && settled,
    leaderName: list[0]?.name ?? '',
  };
}

/** Where one athlete stands today, for the viewer's own line; null when the athlete is not in the board. */
export function boardViewer(board: RankingBoard, playerId: string): BoardViewer | null {
  const entry = board.list.find((candidate) => candidate.playerIds.includes(playerId));
  if (!entry) return null;
  const inside = entry.place <= board.slots;
  const how = board.kind === 'overall' ? null : !inside ? 'out' : (entry.groupPlace ?? 0) <= 2 ? 'direct' : 'bestThird';
  return { entry, inside, how, matchesLeft: Math.max(0, entry.scheduled - entry.matchesPlayed) };
}
