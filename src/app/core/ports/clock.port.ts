import { InjectionToken } from '@angular/core';

/** The current time, so code that needs it can be tested with a clock that does not move on its own. */
export interface Clock {
  /** Milliseconds since the Unix epoch, like `Date.now()`. */
  now(): number;
  /** The current moment as a new `Date`. */
  date(): Date;
  /** The current moment as an ISO 8601 string, like `new Date().toISOString()`. */
  iso(): string;
}
export const CLOCK = new InjectionToken<Clock>('Clock');
