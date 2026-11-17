import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { PlayerGender } from '../core/models';
import { GenderIconComponent } from './gender-icon.component';

@Component({
  selector: 'app-gender-toggle',
  standalone: true,
  imports: [GenderIconComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="gender-toggle"
      [class.compact]="compact()"
      role="radiogroup"
      [attr.aria-label]="label() || ('common.gender.category' | transloco)"
    >
      <button
        type="button"
        role="radio"
        class="male"
        [attr.aria-label]="'common.gender.male' | transloco"
        [class.active]="value() === 'male'"
        [attr.aria-checked]="value() === 'male'"
        (click)="valueChange.emit('male')"
      >
        <app-gender-icon gender="male" /><span>{{ 'common.gender.male' | transloco }}</span>
      </button>
      <button
        type="button"
        role="radio"
        class="female"
        [attr.aria-label]="'common.gender.female' | transloco"
        [class.active]="value() === 'female'"
        [attr.aria-checked]="value() === 'female'"
        (click)="valueChange.emit('female')"
      >
        <app-gender-icon gender="female" /><span>{{ 'common.gender.female' | transloco }}</span>
      </button>
    </div>
  `,
})
export class GenderToggleComponent {
  readonly value = input<PlayerGender | ''>('');
  /** The group's accessible name; empty means "Categoria". */
  readonly label = input('');
  readonly compact = input(false);
  readonly valueChange = output<PlayerGender>();
}
