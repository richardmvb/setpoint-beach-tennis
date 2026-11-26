import type { PlayerStanding, TournamentState } from '../../core/models';
import { fixedPairsMode } from './format';
import {
  compareStandingCriteria,
  directWinsAgainstTiedPlayers,
  rankedStandingGroups,
  storedTieDrawOrder,
} from './standings';

/** The pairs of a fixed pairs tournament that go to the finals: the final and the third place are between pairs. */
export const FINALIST_PAIRS = 4;

/**
 * A fixed pair as one competitor. Partners play every match together, so they share every number; the pair is
 * ranked on its own and never against its own partner. `pairId` (the first partner) stands for the pair wherever
 * a player id is needed (a draw is stored with it); `standing.playerId` is the same id and `standing.name` joins both.
 */
export interface PairStanding {
  pairId: string;
  playerIds: [string, string];
  name: string;
  standing: PlayerStanding;
}

/** The fixed pairs of the tournament, from its groups (the schedule) or, failing that, from the setup. */
export function fixedPairsOf(state: TournamentState): [string, string][] {
  const fromGroups = (state.groups ?? []).flatMap((group) => group.fixedPairs ?? []);
  return fromGroups.length ? fromGroups : (state.fixedPairs ?? []);
}

/**
 * The pairs ranked as groups of pairs the rules could not separate (most groups have one pair): sets won, game
 * balance, games won, then the wins between the tied pairs, then a recorded draw. Empty unless the tournament has
 * fixed pairs. Same rules as the athletes' ranking, with the pair as the competitor.
 */
export function rankedPairGroups(state: TournamentState): PairStanding[][] {
  if (!fixedPairsMode(state)) return [];
  const byId = new Map(
    rankedStandingGroups(state).flatMap((group) => group.map((row) => [row.playerId, row] as const)),
  );
  const pairs = fixedPairsOf(state).flatMap((pair): PairStanding[] => {
    const first = byId.get(pair[0]);
    const second = byId.get(pair[1]);
    if (!first || !second) return [];
    const name = `${first.name} + ${second.name}`;
    return [{ pairId: first.playerId, playerIds: [pair[0], pair[1]], name, standing: { ...first, name } }];
  });
  const sorted = [...pairs].sort(
    (a, b) => compareStandingCriteria(a.standing, b.standing) || a.name.localeCompare(b.name),
  );

  const runs: PairStanding[][] = [];
  for (const pair of sorted) {
    const run = runs[runs.length - 1];
    if (run && compareStandingCriteria(run[0].standing, pair.standing) === 0) run.push(pair);
    else runs.push([pair]);
  }

  const ranked: PairStanding[][] = [];
  for (const run of runs) {
    if (run.length === 1) {
      ranked.push(run);
      continue;
    }
    // Wins against the tied pairs: only the first partner stands for a pair, so a pair beaten counts once.
    const tied = run.map((pair) => pair.standing);
    const withWins = run
      .map((pair) => ({ pair, wins: directWinsAgainstTiedPlayers(state, pair.pairId, tied) }))
      .sort((a, b) => b.wins - a.wins || a.pair.name.localeCompare(b.pair.name));
    const bands: { wins: number; pairs: PairStanding[] }[] = [];
    for (const item of withWins) {
      const band = bands[bands.length - 1];
      if (band && band.wins === item.wins) band.pairs.push(item.pair);
      else bands.push({ wins: item.wins, pairs: [item.pair] });
    }
    for (const band of bands) {
      const drawOrder = storedTieDrawOrder(
        state,
        band.pairs.map((pair) => pair.standing),
      );
      ranked.push(
        drawOrder
          ? [...band.pairs].sort((a, b) => drawOrder.indexOf(a.pairId) - drawOrder.indexOf(b.pairId))
          : band.pairs,
      );
    }
  }
  return ranked;
}
