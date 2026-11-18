import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { groups20State } from '../../testing/groups20';
import { groupQualification } from './group-qualification';

describe('groupQualification, for any scores', () => {
  it('sends 12 distinct athletes: two per group and, with groups of five, every third place', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(4, 5),
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), {
          minLength: 1,
          maxLength: 50,
        }),
        (size, seed, scores) => {
          let index = 0;
          const state = groups20State(size, seed, () => scores[index++ % scores.length]);
          const q = groupQualification(state);
          expect(q.seeding).toHaveLength(12);
          expect(new Set(q.seeding).size).toBe(12);
          for (const group of q.byGroup) {
            const direct = group.rows.filter((row) => row.status === 'direct');
            expect(direct).toHaveLength(2);
            expect(direct.every((row) => q.seeding.includes(row.standing.playerId))).toBe(true);
            if (size === 5) expect(group.rows[2].status).toBe('bestThird');
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
