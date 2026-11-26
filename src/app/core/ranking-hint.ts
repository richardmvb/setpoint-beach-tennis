import { inject, Injectable, signal } from '@angular/core';
import { LOCAL_STORE } from './ports/key-value-store.port';

/** Stored once the person has opened an athlete from the ranking. */
export const RANKING_HINT_KEY = 'setpoint.ranking.hint';

/**
 * The one-line hint above the ranking ("tap an athlete...") shows until the person taps an athlete for the first
 * time; the device remembers it. When storage is blocked the hint simply shows again next time.
 */
@Injectable({ providedIn: 'root' })
export class RankingHint {
  private readonly local = inject(LOCAL_STORE);
  private readonly seenSignal = signal(this.stored());
  readonly seen = this.seenSignal.asReadonly();

  markSeen(): void {
    if (this.seenSignal()) return;
    this.seenSignal.set(true);
    try {
      this.local.setItem(RANKING_HINT_KEY, '1');
    } catch {
      // Storage full or blocked: the hint is gone for this visit anyway.
    }
  }

  private stored(): boolean {
    try {
      return this.local.getItem(RANKING_HINT_KEY) === '1';
    } catch {
      return false;
    }
  }
}
