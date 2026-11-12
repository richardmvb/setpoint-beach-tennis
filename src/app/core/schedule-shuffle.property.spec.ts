import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Match, Player, Round, TournamentSize } from './models';
import { ScheduleService } from './schedule.service';
import { shuffled, shuffleRoundsAndCourts } from './schedule-shuffle';
import { seededRandom } from '../testing/seeded-random';

const seed = fc.integer({ min: 0, max: 2 ** 31 });
const formats: readonly [TournamentSize, number, number][] = [
  [8, 2, 7],
  [10, 2, 10],
  [12, 2, 12],
  [12, 3, 11],
];

const roster = (size: number): Player[] =>
  Array.from({ length: size }, (_, index) => ({ id: `p${index + 1}`, name: `Jogador ${index + 1}` }));
const teamKey = (team: readonly string[]): string => [...team].sort().join('+');
const matchKey = (match: Match): string => [teamKey(match.teamA), teamKey(match.teamB)].sort().join(' x ');
/** What a round is, independent of where it is played: its matches and who rests, without courts. */
const roundKey = (round: Round): string =>
  `${round.matches.map(matchKey).sort().join(' | ')} # ${[...round.restingPlayerIds].sort().join(',')}`;

describe('shuffled (property)', () => {
  it('returns a permutation and leaves the input untouched', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), seed, (items, s) => {
        const copy = [...items];
        const result = shuffled(items, seededRandom(s));
        expect(items).toStrictEqual(copy);
        expect([...result].sort((a, b) => a - b)).toStrictEqual([...items].sort((a, b) => a - b));
      }),
    );
  });

  it('is deterministic for the same random source', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), seed, (items, s) => {
        expect(shuffled(items, seededRandom(s))).toStrictEqual(shuffled(items, seededRandom(s)));
      }),
    );
  });
});

describe('shuffleRoundsAndCourts (property)', () => {
  const generate = (format: readonly [TournamentSize, number, number], s: number): Round[] => {
    const scheduler = new ScheduleService();
    scheduler.random = seededRandom(s);
    return scheduler.generate(roster(format[0]), format[0], format[1], format[2]);
  };

  it('only reorders rounds and rotates courts: every round keeps its matches and rests', () => {
    fc.assert(
      fc.property(fc.constantFrom(...formats), seed, seed, (format, base, shuffle) => {
        const rounds = generate(format, base);
        const result = shuffleRoundsAndCourts(rounds, {
          random: seededRandom(shuffle),
          matchId: (number, match) => `r${number}-m${match.court}`,
        });
        expect(result.map(roundKey).sort()).toStrictEqual(rounds.map(roundKey).sort());
        expect(result.map((round) => round.number)).toStrictEqual(result.map((_, index) => index + 1));
      }),
      { numRuns: 60 },
    );
  });

  it('keeps courts within range, distinct per round, and match ids unique', () => {
    fc.assert(
      fc.property(fc.constantFrom(...formats), seed, (format, s) => {
        const rounds = generate(format, s);
        const ids = rounds.flatMap((round) => round.matches.map((match) => match.id));
        expect(new Set(ids).size).toBe(ids.length);
        for (const round of rounds) {
          const courts = round.matches.map((match) => match.court);
          expect(new Set(courts).size).toBe(courts.length);
          for (const court of courts) {
            expect(court).toBeGreaterThanOrEqual(1);
            expect(court).toBeLessThanOrEqual(format[1]);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it('lets every player appear exactly once per round, and rest evenly', () => {
    fc.assert(
      fc.property(fc.constantFrom(...formats), seed, (format, s) => {
        const rounds = generate(format, s);
        const rests = new Map<string, number>(roster(format[0]).map((player) => [player.id, 0]));
        for (const round of rounds) {
          const present = [
            ...round.matches.flatMap((match) => [...match.teamA, ...match.teamB]),
            ...round.restingPlayerIds,
          ];
          expect(new Set(present).size).toBe(format[0]);
          expect(present.length).toBe(format[0]);
          for (const id of round.restingPlayerIds) rests.set(id, (rests.get(id) ?? 0) + 1);
        }
        const counts = [...rests.values()];
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 60 },
    );
  });
});
