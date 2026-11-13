import { Injectable } from '@angular/core';
import type { Clock } from '../../ports/clock.port';

/** The real time, read on every call. */
@Injectable({ providedIn: 'root' })
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  date(): Date {
    return new Date();
  }
  iso(): string {
    return new Date().toISOString();
  }
}
