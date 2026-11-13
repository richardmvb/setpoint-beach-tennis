import { describe, expect, it } from 'vitest';
import type { Random } from '../random.port';

/** Behavior every Random must have. Run it against the fake and against the browser source. */
export function randomContract(name: string, create: () => Random): void {
  describe(`Random contract: ${name}`, () => {
    it('next() stays in [0, 1)', () => {
      const random = create();
      for (let i = 0; i < 500; i++) {
        const value = random.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('int(n) is a whole number in [0, n), and reaches every value', () => {
      const random = create();
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) {
        const value = random.int(5);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(5);
        seen.add(value);
      }
      expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('int(1) is always 0', () => {
      const random = create();
      for (let i = 0; i < 20; i++) expect(random.int(1)).toBe(0);
    });

    it('uuid() gives a different identifier every time', () => {
      const random = create();
      const ids = new Set(Array.from({ length: 100 }, () => random.uuid()));
      expect(ids.size).toBe(100);
    });
  });
}
