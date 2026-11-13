import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PlayerGender } from '../../../core/models';
import { AvatarPickerComponent } from '../../avatar-picker.component';
import { GenderToggleComponent } from '../../gender-toggle.component';

/** The invite form: name, optional photo and, in a mixed tournament, the category. */
@Component({
  selector: 'app-guest-join-form',
  imports: [FormsModule, TranslocoDirective, AvatarPickerComponent, GenderToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './guest-join-form.component.html',
})
export class GuestJoinFormComponent {
  readonly name = model('');
  readonly gender = model<PlayerGender | ''>('');
  readonly avatar = model('');
  /** Mixed doubles: the category is required. */
  readonly mixed = input(false);
  /** A join is in flight. */
  readonly busy = input(false);
  readonly joinRequested = output<void>();

  protected get canSubmit(): boolean {
    return !!this.name().trim() && !this.busy() && (!this.mixed() || !!this.gender());
  }
}
