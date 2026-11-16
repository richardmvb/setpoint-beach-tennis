import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { GenderIconComponent } from '../../gender-icon.component';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { SetupStore } from '../data/setup.store';

/** Step 3 of the wizard: what was chosen, to check before the schedule is generated. */
@Component({
  selector: 'app-setup-review',
  imports: [TranslocoDirective, GenderIconComponent, PlayerAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './setup-review.component.html',
  styleUrl: './setup-review.component.css',
})
export class SetupReviewComponent {
  protected readonly store = inject(SetupStore);
}
