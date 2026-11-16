import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { SetupStore } from '../data/setup.store';

/** What the shared tournament last said, as the wizard shows it: the error and the notice (if any). */
@Component({
  selector: 'app-setup-feedback',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './setup-feedback.component.html',
})
export class SetupFeedbackComponent {
  protected readonly store = inject(SetupStore);
}
