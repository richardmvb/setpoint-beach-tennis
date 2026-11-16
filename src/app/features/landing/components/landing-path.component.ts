import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * The "Seu caminho" section: what the projection tells each athlete, with a mock-up of its card. It is the
 * `<section>` itself (`<section class="landing-path" appLandingPath>`), like the hero.
 */
@Component({
  selector: 'section[appLandingPath]',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-path.component.html',
  styleUrl: './landing-path.component.css',
})
export class LandingPathComponent {}
