import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

/** Accessible radio group rendered as selectable cards: arrow keys move and select, Tab leaves the group. */
@Component({
  selector: 'app-choice-cards',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:block;min-width:0}'],
  template: `
    <div
      class="choice-cards"
      role="radiogroup"
      [attr.aria-labelledby]="labelledBy || null"
      [attr.aria-label]="labelledBy ? null : label"
      (keydown)="onKey($event)"
    >
      <button
        *ngFor="let option of options; let i = index"
        type="button"
        role="radio"
        class="choice-card"
        [class.selected]="option.value === value"
        [attr.aria-checked]="option.value === value"
        [attr.tabindex]="i === tabStop ? 0 : -1"
        (click)="pick(option.value)"
      >
        <span class="choice-text"
          ><b>{{ option.label }}</b
          ><small *ngIf="option.hint">{{ option.hint }}</small></span
        >
        <span class="choice-check" aria-hidden="true"></span>
      </button>
    </div>
  `,
})
export class ChoiceCardsComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @Input() options: ChoiceOption[] = [];
  @Input() value = '';
  @Input() label = '';
  @Input() labelledBy = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Output() valueChange = new EventEmitter<any>();

  /** Roving tabindex: only the selected card (or the first) is a tab stop. */
  get tabStop(): number {
    return Math.max(
      0,
      this.options.findIndex((option) => option.value === this.value),
    );
  }

  pick(value: string): void {
    if (value !== this.value) this.valueChange.emit(value);
  }

  onKey(event: KeyboardEvent): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if ((!forward && !backward) || !this.options.length) return;
    event.preventDefault();
    const next = (this.tabStop + (forward ? 1 : -1) + this.options.length) % this.options.length;
    this.pick(this.options[next].value);
    setTimeout(() => this.host.nativeElement.querySelectorAll<HTMLElement>('.choice-card')[next]?.focus());
  }
}
