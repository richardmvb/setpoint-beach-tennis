import type { PlayerStanding, TournamentState } from '../../core/models';
import { isScored } from './scoring';

/** The ranking, as groups of players that the tie-break rules could not separate (most groups have one player). */
export function rankedStandingGroups(state: TournamentState): PlayerStanding[][] {
  const rows = buildStandings(state).sort((a, b) => compareStandingCriteria(a, b) || a.name.localeCompare(b.name));
  const criteriaGroups: PlayerStanding[][] = [];
  for (const row of rows) {
    const current = criteriaGroups[criteriaGroups.length - 1];
    if (current && compareStandingCriteria(current[0], row) === 0) current.push(row);
    else criteriaGroups.push([row]);
  }

  const rankedGroups: PlayerStanding[][] = [];
  for (const criteriaGroup of criteriaGroups) {
    if (criteriaGroup.length === 1) {
      rankedGroups.push(criteriaGroup);
      continue;
    }
    const withHeadToHead = criteriaGroup
      .map((row) => ({
        row,
        wins: directWinsAgainstTiedPlayers(state, row.playerId, criteriaGroup),
      }))
      .sort((a, b) => b.wins - a.wins || a.row.name.localeCompare(b.row.name));
    const headToHeadGroups: { wins: number; players: PlayerStanding[] }[] = [];
    for (const item of withHeadToHead) {
      const current = headToHeadGroups[headToHeadGroups.length - 1];
      if (current && current.wins === item.wins) current.players.push(item.row);
      else headToHeadGroups.push({ wins: item.wins, players: [item.row] });
    }
    for (const tiedPlayers of headToHeadGroups) {
      const drawOrder = storedTieDrawOrder(state, tiedPlayers.players);
      rankedGroups.push(
        drawOrder
          ? [...tiedPlayers.players].sort((a, b) => drawOrder.indexOf(a.playerId) - drawOrder.indexOf(b.playerId))
          : tiedPlayers.players,
      );
    }
  }
  return rankedGroups;
}

/** The order a stored tie-break draw gave these exact players, or null when they were never drawn. */
export function storedTieDrawOrder(state: TournamentState, players: PlayerStanding[]): string[] | null {
  const playerIds = players.map((player) => player.playerId).sort();
  return (
    state.tieBreakDraws?.find(
      (draw) =>
        draw.playerIds.length === playerIds.length &&
        [...draw.playerIds].sort().every((id, index) => id === playerIds[index]),
    )?.order ?? null
  );
}

/** The ranking with the players split by gender, for the mixed finals. */
export interface StandingsView {
  groups: PlayerStanding[][];
  all: PlayerStanding[];
  male: PlayerStanding[];
  female: PlayerStanding[];
}

/**
 * Returns a function that computes the standings of a state and reuses the last result while the players, scores
 * and tie-break draws are unchanged. Templates read the ranking on every change detection, and a fresh array each
 * time would re-render it.
 */
export function createStandingsMemo(): (state: TournamentState) => StandingsView {
  let signature: string | null = null;
  let view: StandingsView = { groups: [], all: [], male: [], female: [] };
  return (state) => {
    const next = standingsSignature(state);
    if (next === signature) return view;
    const groups = rankedStandingGroups(state);
    const all = groups.flat();
    const genderByPlayerId = new Map(state.players.map((player) => [player.id, player.gender]));
    view = {
      groups,
      all,
      male: all.filter((row) => genderByPlayerId.get(row.playerId) === 'male'),
      female: all.filter((row) => genderByPlayerId.get(row.playerId) === 'female'),
    };
    signature = next;
    return view;
  };
}

function standingsSignature(state: TournamentState): string {
  return [
    state.players.map((player) => player.id + ':' + player.name + ':' + (player.gender ?? '')).join('|'),
    state.rounds
      .map((round) => round.matches.map((match) => match.id + ':' + match.scoreA + ':' + match.scoreB).join(','))
      .join('|'),
    (state.tieBreakDraws ?? []).map((draw) => draw.playerIds.join(',') + ':' + draw.order.join(',')).join('|'),
  ].join('~');
}

function buildStandings(state: TournamentState): PlayerStanding[] {
  const rows = state.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    setsWon: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameBalance: 0,
    rests: state.rounds.filter((r) => r.restingPlayerIds.includes(player.id)).length,
    matchesPlayed: 0,
  }));
  const byId = new Map<string, PlayerStanding>();
  rows.forEach((row) => byId.set(row.playerId, row));
  for (const round of state.rounds)
    for (const match of round.matches) {
      if (!isScored(match)) continue;
      const a = match.scoreA!;
      const b = match.scoreB!;
      for (const id of match.teamA) {
        const row = byId.get(id);
        if (!row) continue;
        row.gamesFor += a;
        row.gamesAgainst += b;
        row.matchesPlayed++;
        if (a > b) row.setsWon++;
      }
      for (const id of match.teamB) {
        const row = byId.get(id);
        if (!row) continue;
        row.gamesFor += b;
        row.gamesAgainst += a;
        row.matchesPlayed++;
        if (b > a) row.setsWon++;
      }
    }
  return rows.map((row) => ({ ...row, gameBalance: row.gamesFor - row.gamesAgainst }));
}

function compareStandingCriteria(a: PlayerStanding, b: PlayerStanding): number {
  return b.setsWon - a.setsWon || b.gameBalance - a.gameBalance || b.gamesFor - a.gamesFor;
}

function directWinsAgainstTiedPlayers(state: TournamentState, playerId: string, tiedPlayers: PlayerStanding[]): number {
  const tiedIds = new Set(tiedPlayers.map((player) => player.playerId).filter((id) => id !== playerId));
  let wins = 0;
  for (const round of state.rounds)
    for (const match of round.matches) {
      if (!isScored(match)) continue;
      const playerOnA = match.teamA.includes(playerId);
      if (!playerOnA && !match.teamB.includes(playerId)) continue;
      const opponents = playerOnA ? match.teamB : match.teamA;
      const directOpponentCount = opponents.filter((id) => tiedIds.has(id)).length;
      if (!directOpponentCount) continue;
      const playerSideWon = playerOnA ? match.scoreA! > match.scoreB! : match.scoreB! > match.scoreA!;
      if (playerSideWon) wins += directOpponentCount;
    }
  return wins;
}
