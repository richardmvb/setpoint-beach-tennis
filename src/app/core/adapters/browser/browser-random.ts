import { Injectable } from '@angular/core';
import type { Random } from '../../ports/random.port';

/**
 * Randomness from the browser. `Math.random` and `crypto` are read on every call (never cached),
 * because the e2e tests replace them with a seeded source to make the draw repeatable.
 */
@Injectable({ providedIn: 'root' })
export class BrowserRandom implements Random {
  next(): number {
    return Math.random();
  }

  int(maxExclusive: number): number {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.getRandomValues) return Math.floor(Math.random() * maxExclusive);
    // Rejection sampling keeps the result unbiased when maxExclusive does not divide 2^32.
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / maxExclusive) * maxExclusive;
    const sample = new Uint32Array(1);
    do {
      cryptoApi.getRandomValues(sample);
    } while ((sample[0] ?? 0) >= limit);
    return (sample[0] ?? 0) % maxExclusive;
  }

  uuid(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
