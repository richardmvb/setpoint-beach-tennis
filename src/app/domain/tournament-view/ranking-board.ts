import type { PlayerStanding, TournamentState } from '../../core/models';
import { usesGroupQualification, usesRankingBoard } from './format';
import { qualificationField, type QualificationStatus } from './group-qualification';
import { scheduledGroupMatches } from './player-matches';
import { groupStageComplete } from './progress';
import { decidingList } from './ranking-explanation';

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

  return {
    kind: field ? 'qualification' : 'overall',
    groups,
    list,
    slots: slots ?? list.length,
    settled,
    provisional: !state.finals && !settled,
    folded: !!state.finals && settled,
    leaderName: list[0]?.name ?? '',
  };
}
