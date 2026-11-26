import type { PlayerStanding, TournamentState } from '../../core/models';
import { usesGroupQualification, usesRankingBoard } from './format';
import { qualificationField, type QualificationStatus } from './group-qualification';
import { scheduledGroupMatches } from './player-matches';
import { groupStageComplete } from './progress';
import { decidingList } from './ranking-explanation';
import { isScored } from './scoring';
import { rankedStandingGroups } from './standings';

/** One athlete of the board, with what the mini group cards and the cut list show. */
export interface BoardEntry {
  playerId: string;
  name: string;
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
}

export interface BoardGroup {
  id: string;
  name: string;
  entries: BoardEntry[];
}

/** The ranking of a group tournament of 20 or 24 as the board shows it: the groups, and one list with a cut line. */
export interface RankingBoard {
  /** `qualification`: the groups decide who goes on (20); `overall`: the overall ranking decides (24). */
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
  /** 20-player format: the places for the top two of every group, and for the best third places. 0 for 24. */
  directSlots: number;
  thirdSlots: number;
  /** 20-player format: everybody by the plain standings (the groups do not decide it); null for 24, where `list` is it. */
  individual: BoardEntry[] | null;
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

/** The board of a group tournament of 20 or 24 players; null for the other formats and before the schedule exists. */
export function rankingBoard(state: TournamentState): RankingBoard | null {
  if (!usesRankingBoard(state) || !state.rounds.length || !state.groups?.length) return null;
  const { entries, slots } = decidingList(state);
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

  const entryOf = (row: PlayerStanding): BoardEntry => {
    const groupId = groupIdOf.get(row.playerId) ?? '';
    return {
      playerId: row.playerId,
      name: row.name,
      setsWon: row.setsWon,
      gameBalance: row.gameBalance,
      matchesPlayed: row.matchesPlayed,
      scheduled: scheduledGroupMatches(state, row.playerId),
      place: places.get(row.playerId) ?? 0,
      group: groupShortName(groupNames.get(groupId) ?? ''),
      groupPlace: field?.groupOf.get(row.playerId)?.place ?? null,
      status: settled ? (statuses.get(row.playerId) ?? null) : null,
    };
  };
  const byId = new Map(entries.map((row) => [row.playerId, entryOf(row)] as const));
  const list = entries.map((row) => byId.get(row.playerId)!);

  const groups = state.groups.map((group): BoardGroup => {
    const members = group.playerIds.map((id) => byId.get(id)).filter((entry): entry is BoardEntry => !!entry);
    // The 20-player format orders a group by its own rules (head-to-head, draws); 24 follows the overall place.
    members.sort((a, b) => (a.groupPlace ?? a.place) - (b.groupPlace ?? b.place));
    return { id: group.id, name: group.name, entries: members };
  });

  const total = slots ?? list.length;
  const directSlots = field ? Math.min(total, 2 * state.groups.length) : 0;
  const matches = state.rounds.flatMap((round) => round.matches);
  const individual = field
    ? rankedStandingGroups(state)
        .flat()
        .map((row, index) => ({ ...byId.get(row.playerId)!, place: index + 1 }))
    : null;

  return {
    kind: field ? 'qualification' : 'overall',
    groups,
    list,
    slots: total,
    matchesDone: matches.filter(isScored).length,
    matchesTotal: matches.length,
    directSlots,
    thirdSlots: field ? total - directSlots : 0,
    individual,
    settled,
    provisional: !state.finals && !settled,
    folded: !!state.finals && settled,
    leaderName: list[0]?.name ?? '',
  };
}

/** Where one athlete stands today, for the viewer's own line; null when the athlete is not in the board. */
export function boardViewer(board: RankingBoard, playerId: string): BoardViewer | null {
  const entry = board.list.find((candidate) => candidate.playerId === playerId);
  if (!entry) return null;
  const inside = entry.place <= board.slots;
  const how = board.kind === 'overall' ? null : !inside ? 'out' : (entry.groupPlace ?? 0) <= 2 ? 'direct' : 'bestThird';
  return { entry, inside, how, matchesLeft: Math.max(0, entry.scheduled - entry.matchesPlayed) };
}
