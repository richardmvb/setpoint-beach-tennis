import { describe, expect, it } from 'vitest';
import type { Connectivity } from '../connectivity.port';

/** What every `Connectivity` must do. `change` makes the connection come or go and lets the events run. */
export function connectivityContract(
  name: string,
  create: () => { connectivity: Connectivity; change: (online: boolean) => void },
): void {
  describe(`${name} (Connectivity contract)`, () => {
    it('reports a change to the listener until it is stopped', () => {
      const { connectivity, change } = create();
      const seen: boolean[] = [];
      const stop = connectivity.onChange((online) => seen.push(online));
      change(false);
      expect(connectivity.online()).toBe(false);
      change(true);
      stop();
      change(false);
      expect(seen).toEqual([false, true]);
    });
  });
}
