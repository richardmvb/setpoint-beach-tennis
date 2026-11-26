import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage';
import { LOCAL_STORE, type KeyValueStore } from './ports/key-value-store.port';
import { RANKING_HINT_KEY, RankingHint } from './ranking-hint';

function setup(local: KeyValueStore = new MemoryStorage()) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCAL_STORE, useValue: local }] });
  return { hint: TestBed.inject(RankingHint), local };
}

describe('RankingHint', () => {
  it('shows until the first tap, then remembers it on the device', () => {
    const { hint, local } = setup();
    expect(hint.seen()).toBe(false);
    hint.markSeen();
    expect(hint.seen()).toBe(true);
    expect(local.getItem(RANKING_HINT_KEY)).toBe('1');
  });

  it('starts hidden when the device already saw it', () => {
    const local = new MemoryStorage();
    local.setItem(RANKING_HINT_KEY, '1');
    expect(setup(local).hint.seen()).toBe(true);
  });

  it('works when storage is blocked: shown at first, hidden after a tap for this visit', () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
      keys: () => [],
    };
    const { hint } = setup(blocked);
    expect(hint.seen()).toBe(false);
    hint.markSeen();
    expect(hint.seen()).toBe(true);
  });
});
