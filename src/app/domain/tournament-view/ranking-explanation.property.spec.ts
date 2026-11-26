import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PlayerStanding } from '../../core/models';
import { groups20State, groups24State } from '../../testing/groups20';
import { decidingList, placeExplanation, type RankingNeighbour } from './ranking-explanation';

const value = (row: PlayerStanding, criterion: 'wins' | 'balance' | 'gamesFor'): number =>
  criterion === 'wins' ? row.setsWon : criterion === 'balance' ? row.gameBalance : row.gamesFor;

/** A reason must never contradict the numbers: the upper athlete leads on the named criterion and ties before it. */
function checkSeparation(
  upper: PlayerStanding,
  lower: PlayerStanding,
  neighbour: RankingNeighbour,
  list: string,
): void {
  const separation = neighbour.separation;
  if (separation.kind === 'criterion') {
    const order = ['wins', 'balance', 'gamesFor'] as const;
    const at = order.indexOf(separation.criterion);
    for (const earlier of order.slice(0, at)) expect(value(upper, earlier)).toBe(value(lower, earlier));
    expect(value(upper, separation.criterion)).toBeGreaterThan(value(lower, separation.criterion));
    expect([separation.above, separation.below]).toEqual([
      value(upper, separation.criterion),
      value(lower, separation.criterion),
    ]);
  } else if (separation.kind === 'headToHead') {
    expect(separation.above).toBeGreaterThan(separation.below);
    expect(separation.tiedCount).toBeGreaterThan(1);
  } else if (separation.kind === 'qualificationRule') {
    expect(list).toBe('qualification');
  } else if (separation.kind !== 'sameGroup') {
    // Draw, tie or partners: the three criteria are equal.
    expect([upper.setsWon, upper.gameBalance, upper.gamesFor]).toEqual([
      lower.setsWon,
      lower.gameBalance,
      lower.gamesFor,
    ]);
  }
}

describe('placeExplanation, for any scores', () => {
  it('explains every athlete, at the place the deciding list gives, with reasons that match the numbers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'20x4' | '20x5' | '24'>('20x4', '20x5', '24'),
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), {
          minLength: 1,
          maxLength: 40,
        }),
        (shape, seed, scores) => {
          let index = 0;
          const score = (): [number, number] => scores[index++ % scores.length];
          const state =
            shape === '24' ? groups24State(seed, score) : groups20State(shape === '20x4' ? 4 : 5, seed, score);
          const list = decidingList(state);
          list.entries.forEach((row, at) => {
            const explanation = placeExplanation(state, row.playerId)!;
            expect(explanation.place).toBe(at + 1);
            expect(explanation.list).toBe(list.kind);
            if (explanation.above) {
              if (explanation.above.scope === 'list') expect(explanation.above.place).toBeLessThan(at + 1);
              checkSeparation(explanation.above.standing, row, explanation.above, list.kind);
            }
            if (explanation.below) {
              if (explanation.below.scope === 'list') expect(explanation.below.place).toBeGreaterThan(at + 1);
              checkSeparation(row, explanation.below.standing, explanation.below, list.kind);
            }
          });
        },
      ),
      { numRuns: 40 },
    );
  });
});
