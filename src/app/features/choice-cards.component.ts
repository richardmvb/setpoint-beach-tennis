import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, inject, Output, input } from '@angular/core';

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

/** Accessible radio group rendered as selectable cards: arrow keys move and select, Tab leaves the group. */
@Component({
  selector: 'app-choice-cards',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:block;min-width:0}'],
  template: `
    <div
      class="choice-cards"
      role="radiogroup"
      [attr.aria-labelledby]="labelledBy() || null"
      [attr.aria-label]="labelledBy() ? null : label()"
      (keydown)="onKey($event)"
    >
      @for (option of options(); track option; let i = $index) {
        <button
          type="button"
          role="radio"
          class="choice-card"
          [class.selected]="option.value === value()"
          [attr.aria-checked]="option.value === value()"
          [attr.tabindex]="i === tabStop ? 0 : -1"
          (click)="pick(option.value)"
        >
          <span class="choice-text"
            ><b>{{ option.label }}</b>
            @if (option.hint) {
              <small>{{ option.hint }}</small>
            }
          </span>
          <span class="choice-check" aria-hidden="true"></span>
        </button>
      }
    </div>
  `,
})
export class ChoiceCardsComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly options = input<ChoiceOption[]>([]);
  readonly value = input('');
  readonly label = input('');
  readonly labelledBy = input('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Output() valueChange = new EventEmitter<any>();

  /** Roving tabindex: only the selected card (or the first) is a tab stop. */
  get tabStop(): number {
    return Math.max(
      0,
      this.options().findIndex((option) => option.value === this.value()),
    );
  }

  pick(value: string): void {
    if (value !== this.value()) this.valueChange.emit(value);
  }

  onKey(event: KeyboardEvent): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const options = this.options();
    if ((!forward && !backward) || !options.length) return;
    event.preventDefault();
    const next = (this.tabStop + (forward ? 1 : -1) + options.length) % options.length;
    this.pick(options[next].value);
    setTimeout(() => this.host.nativeElement.querySelectorAll<HTMLElement>('.choice-card')[next]?.focus());
  }
}
