import { InjectionToken } from '@angular/core';

/** Randomness, so draws can be repeated in tests. Production uses the browser's sources. */
export interface Random {
  /** A number in [0, 1), like `Math.random()`. */
  next(): number;
  /** An unbiased integer in [0, maxExclusive), from a cryptographic source when the browser has one. */
  int(maxExclusive: number): number;
  /** A new unique identifier. A UUID when the browser can make one, otherwise a time-and-random string. */
  uuid(): string;
}
export const RANDOM = new InjectionToken<Random>('Random');
