import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Player, PlayerStanding, TournamentState } from './models';
import { QualificationService } from './qualification.service';
import { ScheduleService } from './schedule.service';
import { seededRandom } from '../testing/seeded-random';

const service = new QualificationService();
const players: Player[] = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'].map((name, i) => ({
  id: `p${i}`,
  name,
}));

/** A Super 8 where the first `played` matches (in round order) got the given scores. */
function build(played: number, scheduleSeed: number, scores: readonly (readonly [number, number])[]) {
  const scheduler = new ScheduleService();
  scheduler.random = seededRandom(scheduleSeed);
  const rounds = scheduler.generate(players, 8, 2, 7);
  const standings = new Map<string, PlayerStanding>(
    players.map((p) => [
      p.id,
      {
        playerId: p.id,
        name: p.name,
        setsWon: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        gameBalance: 0,
        rests: 0,
        matchesPlayed: 0,
      },
    ]),
  );
  let count = 0;
  for (const round of rounds)
    for (const match of round.matches) {
      if (count >= played) {
        match.scoreA = null;
        match.scoreB = null;
        continue;
      }
      const [a, b] = scores[count++ % scores.length];
      match.scoreA = a;
      match.scoreB = b;
      for (const [team, mine, theirs] of [
        [match.teamA, a, b],
        [match.teamB, b, a],
      ] as const)
        for (const id of team) {
          const row = standings.get(id)!;
          row.gamesFor += mine;
          row.gamesAgainst += theirs;
          if (mine > theirs) row.setsWon++;
        }
    }
  const rows = [...standings.values()];
  rows.forEach((row) => (row.gameBalance = row.gamesFor - row.gamesAgainst));
  rows.sort((a, b) => b.setsWon - a.setsWon || b.gameBalance - a.gameBalance || a.name.localeCompare(b.name));
  const state: TournamentState = {
    version: 1,
    name: 't',
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players,
    rounds,
    createdAt: '',
    tournamentMode: 'super',
  };
  return { state, standings: rows };
}

const score = fc.oneof(
  fc.integer({ min: 0, max: 3 }).map((loser) => [4, loser] as const),
  fc.integer({ min: 0, max: 3 }).map((loser) => [loser, 4] as const),
);
const situation = fc.record({
  played: fc.integer({ min: 0, max: 28 }),
  scheduleSeed: fc.integer({ min: 0, max: 2 ** 31 }),
  scores: fc.array(score, { minLength: 1, maxLength: 28 }),
});

describe('qualification.service (property)', () => {
  it('ranks every athlete once and keeps the counters coherent', () => {
    fc.assert(
      fc.property(situation, ({ played, scheduleSeed, scores }) => {
        const { state, standings } = build(played, scheduleSeed, scores);
        const rows = service.compute(state, standings);
        expect(rows.map((row) => row.playerId).sort()).toStrictEqual(players.map((p) => p.id).sort());
        expect(rows.map((row) => row.position).sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        for (const row of rows) {
          expect(row.remainingMatches).toBeGreaterThanOrEqual(0);
          expect(row.maxWins).toBeGreaterThanOrEqual(row.wins);
          expect(['secure', 'inside', 'chance', 'out']).toContain(row.status);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('formatChance renders any probability as a short percentage', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (probability) => {
        expect(service.formatChance(probability)).toMatch(/^(0%|<1%|>99%|\d{1,3}%)$/);
      }),
    );
  });
});
