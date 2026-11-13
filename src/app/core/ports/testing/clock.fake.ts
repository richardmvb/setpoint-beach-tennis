import type { Clock } from '../clock.port';

/** A clock that only moves when the test says so. */
export class FakeClock implements Clock {
  constructor(private current = Date.UTC(2026, 10, 13, 10, 0, 0)) {}

  now(): number {
    return this.current;
  }
  date(): Date {
    return new Date(this.current);
  }
  iso(): string {
    return new Date(this.current).toISOString();
  }
  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
  set(milliseconds: number): void {
    this.current = milliseconds;
  }
}
