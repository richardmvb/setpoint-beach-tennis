import { Injectable } from '@angular/core';
import Swal, { SweetAlertOptions } from 'sweetalert2';

export interface ConfirmOptions {
  title: string;
  /** Plain text (never HTML), so tournament and player names are safe to interpolate. */
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** `danger` is for destructive actions: the safe choice is focused by default. */
  tone?: 'primary' | 'danger';
}

export interface TypedConfirmOptions extends ConfirmOptions {
  /** The user must type this (case and surrounding spaces are ignored) to enable the confirm button. */
  phrase: string;
}

/** Normalizes what the user typed so "  Finalizar " matches "finalizar". */
export function matchesPhrase(typed: string, phrase: string): boolean {
  return typed.trim().toLocaleLowerCase('pt-BR') === phrase.trim().toLocaleLowerCase('pt-BR');
}

/** Themed confirmation dialogs (SweetAlert2). Styling lives in styles.css under `.sp-dialog`. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const result = await Swal.fire(this.base(options));
    return result.isConfirmed;
  }

  async confirmTyped(options: TypedConfirmOptions): Promise<boolean> {
    const config = {
      ...this.base(options),
      input: 'text',
      inputLabel: `Digite “${options.phrase}” para confirmar`,
      inputPlaceholder: options.phrase,
      inputAttributes: {
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        'aria-label': `Digite ${options.phrase} para confirmar`,
      },
      focusCancel: false,
      focusConfirm: false,
      didOpen: (popup) => {
        const confirm = Swal.getConfirmButton();
        const input = popup.querySelector<HTMLInputElement>('.swal2-input');
        if (!confirm || !input) return;
        confirm.disabled = true;
        input.addEventListener('input', () => {
          confirm.disabled = !matchesPhrase(input.value, options.phrase);
        });
        input.focus();
      },
      preConfirm: (value) =>
        matchesPhrase(String(value ?? ''), options.phrase)
          ? true
          : Swal.showValidationMessage(`Digite exatamente “${options.phrase}”.`),
    } as SweetAlertOptions;
    const result = await Swal.fire(config);
    return result.isConfirmed;
  }

  private base(options: ConfirmOptions): SweetAlertOptions {
    const danger = options.tone === 'danger';
    return {
      title: options.title,
      text: options.text,
      icon: danger ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Confirmar',
      cancelButtonText: options.cancelText ?? 'Cancelar',
      reverseButtons: true,
      focusCancel: danger,
      buttonsStyling: false,
      heightAuto: false,
      returnFocus: true,
      animation: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      customClass: {
        popup: 'sp-dialog',
        title: 'sp-dialog-title',
        htmlContainer: 'sp-dialog-text',
        actions: 'sp-dialog-actions',
        confirmButton: `button ${danger ? 'danger' : 'primary'}`,
        cancelButton: 'button secondary',
        input: 'sp-dialog-input',
        inputLabel: 'sp-dialog-label',
        validationMessage: 'sp-dialog-error',
      },
    };
  }
}
