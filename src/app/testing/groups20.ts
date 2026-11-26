import type { GroupSize, Match, Player, TournamentState } from '../core/models';
import { GroupScheduleService } from '../core/group-schedule.service';
import { match, namedPlayers, round, tournamentState } from './tournament-state';
import { seededRandom } from './seeded-random';
import { shuffledOrder, withTieDraw } from '../domain/tournament-play/tie-draw';
import { unresolvedQualificationTie } from '../domain/tournament-view/group-qualification';

type Score = (match: Match, strength: (id: string) => number) => [number, number];

/** A 20-player tournament with its group schedule drawn; `score` fills every match (or leaves it open). */
export function groups20State(groupSize: GroupSize, seed = 1, score?: Score): TournamentState {
  return rotatingGroupsState(20, groupSize, seed, score);
}

/** 24 players in 6 groups of 4 with rotating partners (open): the finals take the top 8 of the overall ranking. */
export function groups24State(seed = 1, score?: Score): TournamentState {
  return rotatingGroupsState(24, 4, seed, score);
}

/** 8 players in 2 groups of 4 with rotating partners (open): everybody goes to the finals. */
export function groups8State(seed = 1, score?: Score): TournamentState {
  return rotatingGroupsState(8, 4, seed, score);
}

/** 12 players in 3 groups of 4 with rotating partners (open): the finals take the top 8 of 12. */
export function groups12State(seed = 1, score?: Score): TournamentState {
  return rotatingGroupsState(12, 4, seed, score);
}

/** 24 players in 6 groups of 4 with rotating partners in mixed doubles (12 men, 12 women), 2 rounds. */
export function mixedGroups24State(seed = 1, score?: Score): TournamentState {
  return rotatingGroupsState(24, 4, seed, score, true);
}

/** Men first, then women: p1..pN/2 are men and the rest women, so a mixed pair is one of each. */
function mixedPlayers(size: number): Player[] {
  return [...namedPlayers(size / 2, 'male'), ...namedPlayers(size, 'female').slice(size / 2)];
}

function rotatingGroupsState(
  size: 8 | 12 | 20 | 24,
  groupSize: GroupSize,
  seed: number,
  score?: Score,
  mixed = false,
): TournamentState {
  const players = mixed ? mixedPlayers(size) : namedPlayers(size);
  const service = new GroupScheduleService();
  service.random = seededRandom(seed);
  const schedule = service.generate(players, 'rotating', [], mixed, groupSize);
  // Strength grows with the player number, so a pair's strength decides who wins when scores are not given.
  const strength = (id: string): number => Number(id.slice(1));
  const rounds = schedule.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (!score) return match;
      const [scoreA, scoreB] = score(match, strength);
      return { ...match, scoreA, scoreB };
    }),
  }));
  return tournamentState({
    size,
    courts: size / groupSize,
    roundCount: groupSize === 5 ? 5 : mixed ? 2 : 3,
    tournamentMode: 'groups',
    groupFormat: 'rotating',
    doublesFormat: mixed ? 'mixed' : 'open',
    ...(size === 20 ? { groupSize } : {}),
    players,
    groups: schedule.groups,
    rounds,
  });
}

/** The stronger pair wins 6-2 (6-3 when equal strength), so standings are driven by the player numbers. */
export function strongerPairWins(match: Match, strength: (id: string) => number): [number, number] {
  const a = match.teamA.reduce((sum, id) => sum + strength(id), 0);
  const b = match.teamB.reduce((sum, id) => sum + strength(id), 0);
  return a >= b ? [6, a === b ? 3 : 2] : [2, 6];
}

/** Every match ends 6-4 to side A: many athletes finish tied, which is what the draws are for. */
export const sideAWins = (): [number, number] => [6, 4];

/** Records a draw for every tie the rules ask about, until none is left. */
export function settleAllTies(initial: TournamentState, seed = 7): TournamentState {
  const random = seededRandom(seed);
  const randomInt = (max: number): number => Math.floor(random() * max);
  let state = initial;
  for (let step = 0; step < 300; step++) {
    const tied = unresolvedQualificationTie(state);
    if (!tied.length) return state;
    const ids = tied.map((row) => row.playerId);
    state = withTieDraw(state, ids, shuffledOrder(ids, randomInt), '2026-11-18T10:00:00.000Z');
  }
  throw new Error('The ties never settled.');
}

/**
 * Five groups of four, every group scored the same way, so the thirds of all groups are exactly tied. `scoresOf`
 * replaces the three scores of one group (by index), to make one group differ from the others.
 */
export function identicalGroups(scoresOf?: (group: number) => [number, number][] | undefined): TournamentState {
  const players = namedPlayers(20);
  const groups = Array.from({ length: 5 }, (_, g) => ({
    id: `group-${g + 1}`,
    name: `Grupo ${String.fromCharCode(65 + g)}`,
    playerIds: [1, 2, 3, 4].map((n) => `p${g * 4 + n}`),
  }));
  const rounds = [0, 1, 2].map((r) =>
    round(
      r + 1,
      groups.map((group, g) => {
        const [a, b, c, d] = group.playerIds;
        const teams: [[string, string], [string, string]][] = [
          [
            [a, b],
            [c, d],
          ],
          [
            [a, c],
            [b, d],
          ],
          [
            [a, d],
            [b, c],
          ],
        ];
        const scores: [number, number][] = scoresOf?.(g) ?? [
          [6, 1],
          [6, 2],
          [6, 3],
        ];
        return match(`g${g}-r${r}`, teams[r][0], teams[r][1], scores[r][0], scores[r][1], {
          groupId: group.id,
          phase: 'groups',
        });
      }),
    ),
  );
  return tournamentState({
    size: 20,
    courts: 5,
    tournamentMode: 'groups',
    groupFormat: 'rotating',
    players,
    groups,
    rounds,
  });
}

/**
 * Fixed pairs of 8, 12 or 24 players (one group, round robin): p1+p2, p3+p4, ... `score` fills every match; by default
 * the stronger pair wins 6-2 (6-3 when equal), so the numbers follow the player numbers.
 */
export function fixedPairsState(
  size: 8 | 12 | 24,
  seed = 1,
  score: Score | null = strongerPairWins,
): { state: TournamentState; pairs: [string, string][] } {
  const players = namedPlayers(size);
  const pairs = Array.from({ length: size / 2 }, (_, index): [string, string] => [
    `p${index * 2 + 1}`,
    `p${index * 2 + 2}`,
  ]);
  const service = new GroupScheduleService();
  service.random = seededRandom(seed);
  const schedule = service.generate(players, 'fixed', pairs);
  const strength = (id: string): number => Number(id.slice(1));
  const state = tournamentState({
    size,
    tournamentMode: 'groups',
    groupFormat: 'fixed',
    players,
    fixedPairs: pairs,
    groups: schedule.groups,
    rounds: schedule.rounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => {
        if (!score) return m;
        const [scoreA, scoreB] = score(m, strength);
        return { ...m, scoreA, scoreB };
      }),
    })),
  });
  return { state, pairs };
}

/** 8 players in four fixed pairs (one group, round robin), every match 6-3 to side A. */
export function fixedPairs8State(seed = 1): { state: TournamentState; pairs: [string, string][] } {
  return fixedPairsState(8, seed, () => [6, 3]);
}
