import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { projectScenarios, tieValue, type EngineMatch, type EnginePlayer } from './scenario-engine';
import { ScheduleService } from './schedule.service';
import { seededRandom } from '../testing/seeded-random';

const goals = [1, 2, 3] as const;
const players = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'].map((name, i) => ({ id: `p${i}`, name }));
const seed = fc.integer({ min: 0, max: 2 ** 31 });

/** A real Super 8 schedule with the first `played` rounds decided by `outcomes`. */
function scenario(played: number, scheduleSeed: number, outcomes: readonly boolean[]) {
  const scheduler = new ScheduleService();
  scheduler.random = seededRandom(scheduleSeed);
  const rounds = scheduler.generate(players, 8, 2, 7);
  const wins = new Map(players.map((p) => [p.id, 0]));
  const open: EngineMatch[] = [];
  let next = 0;
  rounds.forEach((round, index) =>
    round.matches.forEach((match) => {
      if (index < played) {
        const aWins = outcomes[next++ % outcomes.length];
        (aWins ? match.teamA : match.teamB).forEach((id) => wins.set(id, (wins.get(id) ?? 0) + 1));
      } else open.push({ id: match.id, round: round.number, teamA: match.teamA, teamB: match.teamB });
    }),
  );
  const enginePlayers: EnginePlayer[] = players.map((p) => ({ id: p.id, wins: wins.get(p.id) ?? 0 }));
  return { enginePlayers, open };
}

const situation = fc.record({
  played: fc.integer({ min: 3, max: 7 }),
  scheduleSeed: seed,
  outcomes: fc.array(fc.boolean(), { minLength: 1, maxLength: 16 }),
  me: fc.integer({ min: 0, max: 7 }),
});

describe('tieValue (property)', () => {
  const dims = fc.tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 30 }), fc.constantFrom(1, 2, 3));

  it('is a probability', () => {
    fc.assert(
      fc.property(dims, ([s, t, goal]) => {
        const value = tieValue(s, t, goal);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('never decreases as the goal widens, and never increases with more athletes ahead or tied', () => {
    fc.assert(
      fc.property(dims, ([s, t, goal]) => {
        expect(tieValue(s, t, goal + 1)).toBeGreaterThanOrEqual(tieValue(s, t, goal));
        expect(tieValue(s + 1, t, goal)).toBeLessThanOrEqual(tieValue(s, t, goal));
        expect(tieValue(s, t + 1, goal)).toBeLessThanOrEqual(tieValue(s, t, goal));
      }),
    );
  });
});

describe('projectScenarios (property)', () => {
  it('returns a consistent distribution for any position of a Super 8', () => {
    fc.assert(
      fc.property(situation, ({ played, scheduleSeed, outcomes, me }) => {
        const { enginePlayers, open } = scenario(played, scheduleSeed, outcomes);
        const result = projectScenarios(enginePlayers, open, `p${me}`, { exactLimit: 12, simulations: 2000, seed: 1 });

        expect(result.placeDistribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 6);
        for (const p of result.placeDistribution) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1 + 1e-9);
        }
        expect(result.bestPlace).toBeLessThanOrEqual(result.worstPlace);
        expect(result.expectedPlace).toBeGreaterThanOrEqual(result.bestPlace - 1e-9);
        expect(result.expectedPlace).toBeLessThanOrEqual(result.worstPlace + 1e-9);
        expect(result.bestPossibleWins).toBeGreaterThanOrEqual(result.currentWins);

        const [first, second, third] = goals.map((goal) => result.goals[goal].probability);
        expect(first).toBeLessThanOrEqual(second + 1e-9);
        expect(second).toBeLessThanOrEqual(third + 1e-9);
        for (const goal of goals) {
          const { probability, status } = result.goals[goal];
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1 + 1e-9);
          if (status === 'clinched') expect(probability).toBeCloseTo(1, 6);
          if (status === 'eliminated') expect(probability).toBeCloseTo(0, 6);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('is deterministic for the same seed', () => {
    fc.assert(
      fc.property(situation, ({ played, scheduleSeed, outcomes, me }) => {
        const { enginePlayers, open } = scenario(played, scheduleSeed, outcomes);
        const run = () =>
          projectScenarios(enginePlayers, open, `p${me}`, { exactLimit: 12, simulations: 2000, seed: 7 });
        expect(run()).toStrictEqual(run());
      }),
      { numRuns: 20 },
    );
  });

  it('with every open match forced, only one future remains and the places still add up', () => {
    fc.assert(
      fc.property(situation, fc.array(fc.boolean(), { minLength: 1, maxLength: 16 }), (s, picks) => {
        const { enginePlayers, open } = scenario(s.played, s.scheduleSeed, s.outcomes);
        const forced = Object.fromEntries(open.map((m, i) => [m.id, picks[i % picks.length] ? 'A' : 'B'] as const));
        const result = projectScenarios(enginePlayers, open, `p${s.me}`, { forced });
        expect(result.openMatches).toBe(0);
        expect(result.futures).toBe(1);
        expect(result.placeDistribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 6);
      }),
      { numRuns: 30 },
    );
  });
});
