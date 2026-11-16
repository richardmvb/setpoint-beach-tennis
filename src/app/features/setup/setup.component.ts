import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import { SetupConfigComponent } from './components/setup-config.component';
import { SetupPlayersComponent } from './components/setup-players.component';
import { SetupReviewComponent } from './components/setup-review.component';
import { SetupStore } from './data/setup.store';
import { SetupTour } from './data/setup-tour';
import { SetupTourCue } from './data/setup-tour-cue';

/**
 * The setup wizard: configuration, players and review of a new tournament, plus the shared-tournament setup for a
 * moderator. Rendered by `AppComponent` with `@defer`, so it is its own chunk; the page is the `<section>` itself
 * (`<section appSetup>`), so the DOM stays what it was. It renders the frame of each step (progress, panel, tour bar,
 * actions) and the step bodies are its children. Generating the schedule, opening the saved tournaments and
 * cancelling a shared tournament are outputs: the shell does them.
 */
@Component({
  selector: 'section[appSetup]',
  imports: [
    TranslocoDirective,
    ButtonComponent,
    CardComponent,
    SetupConfigComponent,
    SetupPlayersComponent,
    SetupReviewComponent,
  ],
  providers: [SetupStore, SetupTour, provideTranslocoScope('setup')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'setup-wizard' },
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.css',
})
export class SetupComponent {
  protected readonly store = inject(SetupStore);
  private readonly tour = inject(SetupTour);
  private readonly cue = inject(SetupTourCue);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly progress = viewChild<ElementRef<HTMLElement>>('progress');
  /** "Gerar tabela e iniciar": the shell generates the schedule. */
  readonly start = output<void>();
  readonly openLibrary = output<void>();
  readonly cancelShared = output<void>();

  constructor() {
    // The shell says the tour may start; it starts once the page's text has loaded and the wizard is on screen.
    effect(() => {
      if (!this.cue.pending() || !this.progress()) return;
      this.cue.take();
      this.later(() => void this.tour.startIfDue(), 0);
    });
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  /** A timeout the page cancels when it goes away (the landing page, a saved tournament), so no tour starts late. */
  private later(action: () => void, milliseconds: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, milliseconds);
    this.timers.add(timer);
  }

  protected startTour(): Promise<void> {
    return this.tour.start();
  }

  protected async next(): Promise<void> {
    if (await this.store.next()) this.later(() => void this.tour.startIfDue(), 450);
  }
}
