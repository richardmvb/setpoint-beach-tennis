import { Dialog } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from '@ui/dialog/confirm-dialog.component';

export { matchesPhrase } from '@ui/dialog/matches-phrase';

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

/**
 * Confirmation dialogs, built on the CDK Dialog (focus trap, Escape, scroll lock, focus returns to the opener).
 * Each call resolves `true` when confirmed and `false` on Cancel, Escape or a click outside.
 * The dialog itself is src/app/ui/dialog; styling lives in src/styles/components/dialog.css.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private static counter = 0;
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.open(options);
  }

  confirmTyped(options: TypedConfirmOptions): Promise<boolean> {
    return this.open(options, options.phrase);
  }

  private async open(options: ConfirmOptions, phrase?: string): Promise<boolean> {
    const id = `ui-dialog-${++DialogService.counter}`;
    const data: ConfirmDialogData = {
      title: options.title,
      text: options.text,
      confirmText: options.confirmText ?? 'Confirmar',
      cancelText: options.cancelText ?? 'Cancelar',
      tone: options.tone === 'danger' ? 'danger' : 'primary',
      phrase,
      titleId: `${id}-title`,
      textId: `${id}-text`,
    };
    const ref = this.dialog.open<boolean, ConfirmDialogData, ConfirmDialogComponent>(ConfirmDialogComponent, {
      data,
      role: 'alertdialog',
      ariaModal: true,
      ariaLabelledBy: data.titleId,
      ariaDescribedBy: options.text ? data.textId : null,
      autoFocus: '[data-autofocus]',
      restoreFocus: true,
      hasBackdrop: true,
      closeOnNavigation: true,
      panelClass: 'ui-dialog-panel',
      backdropClass: 'ui-dialog-backdrop',
      positionStrategy: this.position(),
    });
    return (await firstValueFrom(ref.closed)) === true;
  }

  /** Centered on a large screen, a sheet from the bottom on a phone. */
  private position() {
    const phone = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 520px)').matches;
    const strategy = this.overlay.position().global().centerHorizontally();
    return phone ? strategy.bottom('0') : strategy.centerVertically();
  }
}
