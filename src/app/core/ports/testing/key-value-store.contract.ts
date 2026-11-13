import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../key-value-store.port';

/** Behavior every KeyValueStore must have. Run it against the in-memory fake and against the browser stores. */
export function keyValueStoreContract(name: string, create: () => KeyValueStore): void {
  describe(`KeyValueStore contract: ${name}`, () => {
    it('returns null for a key that was never set', () => {
      expect(create().getItem('missing')).toBeNull();
    });

    it('returns what was set, and replaces it on a second set', () => {
      const store = create();
      store.setItem('k', 'one');
      expect(store.getItem('k')).toBe('one');
      store.setItem('k', 'two');
      expect(store.getItem('k')).toBe('two');
    });

    it('keeps keys apart', () => {
      const store = create();
      store.setItem('a', '1');
      store.setItem('b', '2');
      expect(store.getItem('a')).toBe('1');
      expect(store.getItem('b')).toBe('2');
    });

    it('removes a key, and removing a missing key is harmless', () => {
      const store = create();
      store.setItem('k', 'v');
      store.removeItem('k');
      store.removeItem('never-set');
      expect(store.getItem('k')).toBeNull();
    });

    it('stores the empty string as a value, distinct from a missing key', () => {
      const store = create();
      store.setItem('k', '');
      expect(store.getItem('k')).toBe('');
    });

    it('lists the keys that are set, and not the ones that were removed', () => {
      const store = create();
      store.setItem('a', '1');
      store.setItem('b', '2');
      store.removeItem('a');
      expect(store.keys()).toEqual(['b']);
    });
  });
}
