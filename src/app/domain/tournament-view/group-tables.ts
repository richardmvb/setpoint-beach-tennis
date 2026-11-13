import type { PlayerStanding, TournamentState } from '../../core/models';
import { fixedPairsMode } from './format';

/** One row of a group table: a player, or a fixed pair (which shares one standing). */
export interface GroupStandingEntry {
  label: string;
  playerIds: string[];
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  matchesPlayed: number;
}

export interface GroupStandingTable {
  id: string;
  name: string;
  entries: GroupStandingEntry[];
}

/** The table of each group, sorted by sets won, game balance, games won, then name. */
export function groupTables(state: TournamentState, standings: PlayerStanding[]): GroupStandingTable[] {
  const byPlayer = new Map(standings.map((row) => [row.playerId, row]));
  const pairs = fixedPairsMode(state);
  return (state.groups ?? []).map((group) => {
    const entries =
      pairs && group.fixedPairs
        ? group.fixedPairs.map((pair) => groupEntry(state, pair, byPlayer))
        : group.playerIds.map((playerId) => groupEntry(state, [playerId], byPlayer));
    entries.sort(
      (a, b) =>
        b.setsWon - a.setsWon ||
        b.gameBalance - a.gameBalance ||
        b.gamesFor - a.gamesFor ||
        a.label.localeCompare(b.label),
    );
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
