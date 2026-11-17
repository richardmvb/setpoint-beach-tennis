import { scrollBehavior } from '../../core/motion';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { LandingHeroComponent } from './components/landing-hero.component';
import { LandingPathComponent } from './components/landing-path.component';
import { LandingStore } from './data/landing.store';

/** The sections the page links to. */
type LandingSection = 'landing-formats' | 'landing-live' | 'landing-path' | 'landing-steps';

/**
 * The first-visit page: what SETPOINT does, its section links, and the way into the app. Rendered by
 * `AppComponent` with `@defer`, so it is its own chunk. Leaving it is an output; `AppComponent` opens the app
 * (`start`) or the saved tournaments (`resume`).
 */
@Component({
  selector: 'app-landing',
  imports: [TranslocoDirective, ButtonComponent, LandingHeroComponent, LandingPathComponent],
  providers: [LandingStore, provideTranslocoScope('landing')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent {
  protected readonly store = inject(LandingStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** How many tournaments this device has saved: offers "Meus torneios" and "Retomar um torneio" when any. */
  readonly savedCount = input(0);
  readonly start = output<void>();
  readonly resume = output<void>();

  protected startTournament(): void {
    this.store.start();
    this.start.emit();
  }

  protected resumeTournament(): void {
    this.store.resume();
    this.resume.emit();
  }

  protected scrollTo(section: LandingSection): void {
    this.host.nativeElement
      .querySelector(`#${section}`)
      ?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
}
