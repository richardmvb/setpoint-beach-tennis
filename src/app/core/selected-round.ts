import { Injectable, signal } from '@angular/core';

/**
 * Which round the Partidas page shows. It is a root service because it outlives the page: the shell hides the whole
 * app to show the landing page, and the organizer comes back to the round they were on. The shell resets it when the
 * tournament it belongs to is replaced (a new draw, a saved tournament, a backup).
 */
@Injectable({ providedIn: 'root' })
export class SelectedRound {
  private readonly current = signal(0);

  readonly index = this.current.asReadonly();

  /** Shows a round of a schedule with `roundCount` rounds; an index outside it is ignored. */
  select(index: number, roundCount: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= roundCount) return false;
    this.current.set(index);
    return true;
  }

  reset(): void {
    this.current.set(0);
  }
}
