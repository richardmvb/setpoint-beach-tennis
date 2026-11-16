import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';

/**
 * The landing's first screen: the pitch, its calls to action and a mock-up of the app. It is the `<section>`
 * itself (`<section class="landing-hero" appLandingHero>`), so the page's layout rules still reach it; its
 * own stylesheet styles what is inside.
 */
@Component({
  selector: 'section[appLandingHero]',
  imports: [TranslocoDirective, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-hero.component.html',
  styleUrl: './landing-hero.component.css',
})
export class LandingHeroComponent {
  /** Saved tournaments on this device: with any, "Retomar um torneio" replaces "Ver como funciona". */
  readonly savedCount = input(0);
  readonly start = output<void>();
  readonly resume = output<void>();
  readonly howItWorks = output<void>();
}
