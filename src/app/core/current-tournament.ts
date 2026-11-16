import { inject, Injectable, signal } from '@angular/core';
import { newTournament } from '../domain/tournament-setup/setup-rules';
import type { TournamentState } from './models';
import { CLOCK } from './ports/clock.port';

/** What the shell does for whoever edits the tournament: save it, and tell the person something. */
export interface TournamentHooks {
  /** Stores the tournament (this device, the sync queue, the library). `success` is the message to show. */
  save(success?: string): void;
  notify(text: string, tone: 'success' | 'error'): void;
  clearNotice(): void;
}

/**
 * The tournament being run on this device, as a signal, so a feature can show it and change it. A feature replaces it
 * (`update` returns a new object) and never edits it in place, or its views would not refresh. `AppComponent` still
 * holds the same object as `state` and may edit it in place while no feature is showing it (its scores, its sync);
 * until the shell is signal-based (B5) it also provides the hooks that save and notify.
 */
@Injectable({ providedIn: 'root' })
export class CurrentTournament {
  private readonly current = signal<TournamentState>(newTournament(inject(CLOCK).iso()));
  private hooks: TournamentHooks | null = null;

  readonly state = this.current.asReadonly();

  set(state: TournamentState): void {
    this.current.set(state);
  }

  update(change: (state: TournamentState) => TournamentState): void {
    this.current.update(change);
  }

  connect(hooks: TournamentHooks): void {
    this.hooks = hooks;
  }

  save(success?: string): void {
    this.hooks?.save(success);
  }

  notify(text: string, tone: 'success' | 'error' = 'success'): void {
    this.hooks?.notify(text, tone);
  }

  clearNotice(): void {
    this.hooks?.clearNotice();
  }
}
