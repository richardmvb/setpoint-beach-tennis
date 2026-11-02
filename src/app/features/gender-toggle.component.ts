import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { PlayerGender } from '../core/models';

@Component({
  selector: 'app-gender-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gender-toggle" role="radiogroup" [attr.aria-label]="label">
      <button type="button" role="radio" [class.active]="value === 'male'" [attr.aria-checked]="value === 'male'" (click)="valueChange.emit('male')">Masculino</button>
      <button type="button" role="radio" [class.active]="value === 'female'" [attr.aria-checked]="value === 'female'" (click)="valueChange.emit('female')">Feminino</button>
    </div>
  `
})
export class GenderToggleComponent {
  @Input() value: PlayerGender | '' = '';
  @Input() label = 'Categoria';
  @Output() valueChange = new EventEmitter<PlayerGender>();
}
