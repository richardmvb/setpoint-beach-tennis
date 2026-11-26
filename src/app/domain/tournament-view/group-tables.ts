import type { PlayerStanding, TournamentState } from '../../core/models';
import { fixedPairsMode, usesGroupQualification } from './format';
import { groupQualification, type QualificationStatus } from './group-qualification';
import { groupStageComplete } from './progress';

/** One row of a group table: a player, or a fixed pair (which shares one standing). */
export interface GroupStandingEntry {
  label: string;
  playerIds: string[];
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  matchesPlayed: number;
  /** Only in the 20-player format, and only once every group match has a score: does this athlete reach the finals. */
  status?: QualificationStatus;
}

export interface GroupStandingTable {
  id: string;
  name: string;
  entries: GroupStandingEntry[];
}

/**
 * The table of each group: in the 20-player format by the qualification rules, in the other formats by the overall
 * order of `standings` (sets won, game balance, games won, head-to-head, recorded draws, then name).
 */
export function groupTables(state: TournamentState, standings: PlayerStanding[]): GroupStandingTable[] {
  const byPlayer = new Map(standings.map((row) => [row.playerId, row]));
  const order = new Map(standings.map((row, index) => [row.playerId, index]));
  if (usesGroupQualification(state)) {
    const settled = groupStageComplete(state);
    return groupQualification(state).byGroup.map((table) => ({
      id: table.groupId,
      name: table.name,
      entries: table.rows.map((row) => ({
        ...groupEntry(state, [row.standing.playerId], byPlayer),
        ...(settled ? { status: row.status } : {}),
      })),
    }));
  }
  const pairs = fixedPairsMode(state);
  return (state.groups ?? []).map((group) => {
    const entries =
      pairs && group.fixedPairs
        ? group.fixedPairs.map((pair) => groupEntry(state, pair, byPlayer))
        : group.playerIds.map((playerId) => groupEntry(state, [playerId], byPlayer));
    // The overall order (criteria, head-to-head, recorded draws), so a group never contradicts the ranking.
    entries.sort((a, b) => order.get(a.playerIds[0])! - order.get(b.playerIds[0])!);
    return { id: group.id, name: group.name, entries };
  });
}

function groupEntry(
  state: TournamentState,
  playerIds: string[],
  standings: Map<string, PlayerStanding>,
): GroupStandingEntry {
  const players = playerIds.map((id) => state.players.find((player) => player.id === id));
  const standing = standings.get(playerIds[0]);
  if (!standing || players.some((player) => !player)) throw new Error('Jogador não encontrado no ranking do grupo.');
  return {
    label: players.map((player) => player!.name).join(' + '),
    playerIds,
    setsWon: standing.setsWon,
    gamesFor: standing.gamesFor,
    gamesAgainst: standing.gamesAgainst,
    gameBalance: standing.gameBalance,
    matchesPlayed: standing.matchesPlayed,
  };
}
