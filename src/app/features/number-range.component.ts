import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-number-range',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="values.length < 2" class="number-range static">
      <div class="number-range-head">
        <span class="range-label">{{ label }}</span><strong>{{ displayValue }}</strong>
      </div>
      <small class="muted">Definido pelo formato escolhido.</small>
    </div>
    <div *ngIf="values.length > 1" class="number-range">
      <div class="number-range-head">
        <label [attr.for]="inputId">{{ label }}</label><strong>{{ displayValue }}</strong>
      </div>
      <input
        [id]="inputId"
        type="range"
        [min]="0"
        [max]="values.length - 1"
        step="1"
        [value]="selectedIndex"
        [disabled]="values.length < 2"
        (input)="select($event)"
        [attr.aria-valuetext]="displayValue"
      />
      <div class="number-range-ticks" [style.--range-count]="values.length">
        <span *ngFor="let item of values; let i = index" [class.active]="item === value">{{ item }}</span>
      </div>
    </div>
  `,
})
export class NumberRangeComponent {
  @Input() label = '';
  @Input() values: number[] = [];
  @Input() value = 0;
  @Input() suffix = '';
  @Input() inputId = 'number-range';
  @Output() valueChange = new EventEmitter<number>();
  get selectedIndex(): number {
    return Math.max(0, this.values.indexOf(this.value));
  }
  get displayValue(): string {
    return this.value + (this.suffix ? ' ' + this.suffix : '');
  }
  select(event: Event): void {
    const index = Number((event.target as HTMLInputElement).value);
    const value = this.values[index];
    if (value !== undefined) this.valueChange.emit(value);
  }
}
