import { describe, expect, it } from 'vitest';
import type { Clock } from '../clock.port';

/** Behavior every Clock must have. Run it against the fake and against the system clock. */
export function clockContract(name: string, create: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('now() is a whole number of milliseconds', () => {
      expect(Number.isInteger(create().now())).toBe(true);
    });

    it('date() is a new Date at the same moment as now()', () => {
      const clock = create();
      const first = clock.date();
      const second = clock.date();
      expect(first).toBeInstanceOf(Date);
      expect(first).not.toBe(second);
      expect(Math.abs(first.getTime() - clock.now())).toBeLessThan(1000);
    });

    it('iso() is an ISO 8601 UTC string for the same moment', () => {
      const clock = create();
      const iso = clock.iso();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Math.abs(new Date(iso).getTime() - clock.now())).toBeLessThan(1000);
    });

    it('never goes backwards', () => {
      const clock = create();
      const first = clock.now();
      expect(clock.now()).toBeGreaterThanOrEqual(first);
    });
  });
}
