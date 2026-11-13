import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { UpdateTarget } from '../data/update-target';

/** The guest's bottom bar on phones: jump to a section, or open "Meu caminho". */
@Component({
  selector: 'app-guest-nav',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './guest-nav.component.html',
})
export class GuestNavComponent {
  readonly tab = input<'main' | 'projection'>('main');
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
