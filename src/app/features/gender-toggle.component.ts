import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerGender } from '../core/models';
import { GenderIconComponent } from './gender-icon.component';

@Component({
  selector: 'app-gender-toggle',
  standalone: true,
  imports: [CommonModule, GenderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gender-toggle" [class.compact]="compact" role="radiogroup" [attr.aria-label]="label">
      <button type="button" role="radio" class="male" [class.active]="value === 'male'" [attr.aria-checked]="value === 'male'" (click)="valueChange.emit('male')"><app-gender-icon gender="male"></app-gender-icon><span>Masculino</span></button>
      <button type="button" role="radio" class="female" [class.active]="value === 'female'" [attr.aria-checked]="value === 'female'" (click)="valueChange.emit('female')"><app-gender-icon gender="female"></app-gender-icon><span>Feminino</span></button>
    </div>
  `
})
export class GenderToggleComponent {
  @Input() value: PlayerGender | '' = '';
  @Input() label = 'Categoria';
  @Input() compact = false;
  @Output() valueChange = new EventEmitter<PlayerGender>();
}
