import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../testing/seeded-random';
import { pairQualifiers } from './qualifier-pairs';

const seeding = Array.from({ length: 12 }, (_, index) => `s${index + 1}`);
const randomInt = (seed: number) => {
  const random = seededRandom(seed);
  return (max: number): number => Math.floor(random() * max);
};

describe('pairQualifiers', () => {
  it('crossed: 1+3, 2+4, 5+7, 6+8, 9+11, 10+12', () => {
    expect(pairQualifiers(seeding, 'crossed', randomInt(1))).toEqual([
      ['s1', 's3'],
      ['s2', 's4'],
      ['s5', 's7'],
      ['s6', 's8'],
      ['s9', 's11'],
      ['s10', 's12'],
    ]);
  });

  it('seeded draw: the six best head the pairs D1 to D6 and each gets one of seeds 7 to 12', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (seed) => {
        const pairs = pairQualifiers(seeding, 'seededDraw', randomInt(seed));
        expect(pairs.map((pair) => pair[0])).toEqual(seeding.slice(0, 6));
        expect(pairs.map((pair) => pair[1]).sort()).toEqual(seeding.slice(6).sort());
      }),
    );
  });

  it('needs exactly twelve qualifiers', () => {
    expect(() => pairQualifiers(seeding.slice(0, 11), 'crossed', randomInt(1))).toThrow();
  });
});
