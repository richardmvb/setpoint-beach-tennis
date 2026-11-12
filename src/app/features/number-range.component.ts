import { ChangeDetectionStrategy, Component, Input, input, output } from '@angular/core';

@Component({
  selector: 'app-number-range',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (values.length < 2) {
      <div class="number-range static">
        <div class="number-range-head">
          <span class="range-label">{{ label() }}</span><strong>{{ displayValue }}</strong>
        </div>
        <small class="muted">Definido pelo formato escolhido.</small>
      </div>
    }
    @if (values.length > 1) {
      <div class="number-range">
        <div class="number-range-head">
          <label [attr.for]="inputId()">{{ label() }}</label><strong>{{ displayValue }}</strong>
        </div>
        <input
          [id]="inputId()"
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
          @for (item of values; track item; let i = $index) {
            <span [class.active]="item === value()">{{ item }}</span>
          }
        </div>
      </div>
    }
  `,
})
export class NumberRangeComponent {
  readonly label = input('');
  @Input() values: number[] = [];
  readonly value = input(0);
  readonly suffix = input('');
  readonly inputId = input('number-range');
  readonly valueChange = output<number>();
  get selectedIndex(): number {
    return Math.max(0, this.values.indexOf(this.value()));
  }
  get displayValue(): string {
    const suffix = this.suffix();
    return this.value() + (suffix ? ' ' + suffix : '');
  }
  select(event: Event): void {
    const index = Number((event.target as HTMLInputElement).value);
    const value = this.values[index];
    if (value !== undefined) this.valueChange.emit(value);
  }
}
