import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { GuestSection, UpdateTarget } from '../data/update-target';

/** The guest's navigation bar: Partidas, Ranking, Finais (one section at a time) and "Meu caminho". */
@Component({
  selector: 'app-guest-nav',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './guest-nav.component.html',
})
export class GuestNavComponent {
  readonly tab = input<'main' | 'projection'>('main');
  /** The section on screen while `tab` is `main`. */
  readonly section = input<GuestSection>('rounds');
  /** The ranking has something to show (the schedule exists). */
  readonly hasRanking = input(true);
  /** The projection exists for this guest (it may still be locked). */
  readonly projectionConfigured = input(false);
  readonly projectionAvailable = input(false);
  /** The guest's chance for the chosen goal, or empty. */
  readonly chance = input('');
  readonly hasNews = input(false);
  readonly showTip = input(false);
  readonly hintVisible = input(false);
  readonly hasFinals = input(false);
  readonly sectionSelected = output<UpdateTarget>();
  readonly projectionSelected = output<void>();
  readonly tipDismissed = output<void>();
}
