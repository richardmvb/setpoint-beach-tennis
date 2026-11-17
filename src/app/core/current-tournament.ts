import { inject, Injectable, signal } from '@angular/core';
import { newTournament } from '../domain/tournament-setup/setup-rules';
import type { TournamentState } from './models';
import { CLOCK } from './ports/clock.port';
import { RANDOM } from './ports/random.port';

/**
 * The tournament being run on this device, as a signal, so the shell and the features see and change the same one.
 * Everyone replaces it (`update` returns a new object) and never edits it in place, or an OnPush view would not
 * refresh. Saving it is `TournamentPersistence.save`; telling the person something is `Notices`.
 */
@Injectable({ providedIn: 'root' })
export class CurrentTournament {
  private readonly random = inject(RANDOM);
  private readonly current = signal<TournamentState>(newTournament(inject(CLOCK).iso()));

  readonly state = this.current.asReadonly();

  set(state: TournamentState): void {
    this.current.set(state);
  }

  update(change: (state: TournamentState) => TournamentState): void {
    this.current.update(change);
  }

  /** Gives the tournament its analytics id when it has none yet (a new object, so the views that show it refresh). */
  ensureAnalyticsId(): string {
    if (!this.current().analyticsId) this.current.update((state) => ({ ...state, analyticsId: this.random.uuid() }));
    return this.current().analyticsId ?? '';
  }
}
