import { Injectable, signal } from '@angular/core';

/**
 * The shell's way of saying "the setup tour may start now" (after the first-visit welcome, the landing page or the
 * unlock screen). The shell decides when it is allowed; the setup page, which owns the tour, picks the cue up when
 * it is on screen, or as soon as it loads.
 */
@Injectable({ providedIn: 'root' })
export class SetupTourCue {
  private readonly waiting = signal(false);

  readonly pending = this.waiting.asReadonly();

  request(): void {
    this.waiting.set(true);
  }

  /** Marks the cue as heard. */
  take(): void {
    this.waiting.set(false);
  }
}
