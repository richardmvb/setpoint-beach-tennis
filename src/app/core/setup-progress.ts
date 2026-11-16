import { inject, Injectable, signal } from '@angular/core';
import { CurrentTournament } from './current-tournament';
import { ANALYTICS } from './ports/analytics.port';

export type SetupStepNumber = 1 | 2 | 3;

/**
 * Which step of the setup wizard the organizer is on, and the analytics for moving between steps. It is a root
 * service because the step outlives the page: the shell shows the landing page and comes back to the same step, and
 * puts the moderator on step 2 after a reload or a clear.
 */
@Injectable({ providedIn: 'root' })
export class SetupProgress {
  private readonly tournament = inject(CurrentTournament);
  private readonly analytics = inject(ANALYTICS);
  private readonly current = signal<SetupStepNumber>(1);

  readonly step = this.current.asReadonly();

  /** Moves to a step without telling analytics (a "← Voltar" that is not a revisit of a completed step). */
  set(step: SetupStepNumber): void {
    this.current.set(step);
  }

  /** Moves to a step and records that it was viewed. */
  show(step: SetupStepNumber): void {
    this.current.set(step);
    this.viewed(step);
  }

  viewed(step: SetupStepNumber = this.current()): void {
    this.analytics.capture('tournament_setup_step_viewed', this.properties(step));
  }

  completed(step: SetupStepNumber): void {
    this.analytics.capture('tournament_setup_step_completed', this.properties(step));
  }

  /** A completed step is revisited from the progress bar. */
  revisit(to: SetupStepNumber): void {
    this.analytics.capture('tournament_setup_step_back', { from: this.current(), to });
    this.show(to);
  }

  private properties(step: SetupStepNumber) {
    const state = this.tournament.state();
    return {
      step,
      hosting_mode: state.hostingMode,
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      tournament_size: state.size,
    };
  }
}
