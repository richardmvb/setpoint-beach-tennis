import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { matchesPhrase } from './matches-phrase';

/** What the dialog shows. Plain text only (never HTML), so names can be put in the title and text safely. */
export interface ConfirmDialogData {
  title: string;
  text?: string;
  confirmText: string;
  cancelText: string;
  /** `danger` is for destructive actions: Cancel is focused first and Confirm is red. */
  tone: 'primary' | 'danger';
  /** When set, the person must type it (case and surrounding spaces ignored) before Confirm is enabled. */
  phrase?: string;
  /** Ids the opener puts on the dialog (aria-labelledby and aria-describedby), also used here. */
  titleId: string;
  textId: string;
}

/**
 * A confirmation dialog. Open it through `DialogService` (core), which sets the role, the focus rules and the position.
 * Closes with `true` on Confirm and `false` on Cancel, Escape or a click on the backdrop.
 * The look lives in src/styles/components/dialog.css.
 */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ui-dialog' },
  template: `
    <span class="ui-dialog-icon" [class.is-danger]="danger" aria-hidden="true">{{ danger ? '!' : '?' }}</span>
    <h2 class="ui-dialog-title" [id]="data.titleId">{{ data.title }}</h2>
    @if (data.text) {
      <p class="ui-dialog-text" [id]="data.textId">{{ data.text }}</p>
    }
    @if (data.phrase) {
      <label class="ui-dialog-label" [for]="inputId">Digite “{{ data.phrase }}” para confirmar</label>
      <input
        class="ui-dialog-input"
        data-autofocus
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        [id]="inputId"
        [attr.aria-invalid]="showError() ? 'true' : null"
        [attr.aria-describedby]="showError() ? errorId : null"
        (input)="onInput($event)"
        (keydown.enter)="accept()"
      />
      @if (showError()) {
        <p class="ui-dialog-error" role="alert" [id]="errorId">Digite exatamente “{{ data.phrase }}”.</p>
      }
    }
    <div class="ui-dialog-actions">
      <button uiButton variant="secondary" [attr.data-autofocus]="focusCancel ? '' : null" (click)="dismiss()">
        {{ data.cancelText }}
      </button>
      <button
        uiButton
        [variant]="danger ? 'danger' : 'primary'"
        [attr.data-autofocus]="focusConfirm ? '' : null"
        [disabled]="!phraseMatches()"
        (click)="accept()"
      >
        {{ data.confirmText }}
      </button>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected readonly danger = this.data.tone === 'danger';
  /** Focus goes to the safe choice for a destructive action, to the field when one must be typed, else to Confirm. */
  protected readonly focusCancel = this.danger && !this.data.phrase;
  protected readonly focusConfirm = !this.danger && !this.data.phrase;
  protected readonly inputId = `${this.data.titleId}-input`;
  protected readonly errorId = `${this.data.titleId}-error`;

  private readonly typed = signal('');
  protected readonly showError = signal(false);
  protected readonly phraseMatches = computed(() => !this.data.phrase || matchesPhrase(this.typed(), this.data.phrase));

  protected onInput(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
    this.showError.set(false);
  }

  protected accept(): void {
    if (!this.phraseMatches()) {
      this.showError.set(true);
      return;
    }
    this.ref.close(true);
  }

  protected dismiss(): void {
    this.ref.close(false);
  }
}
