import { Dialog } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/portal';
import { Overlay } from '@angular/cdk/overlay';
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
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

/** A feature dialog: a component that renders its own content (see `DialogService.open`). */
export interface PanelOptions<D> {
  data: D;
  /** Id of the element that names the dialog (its title). */
  labelledBy: string;
  /** Below this viewport width (px) the dialog is a sheet at the bottom of the screen, matching its CSS. */
  sheetBelow?: number;
  /** Open as a popover at this offset from the top-right of the viewport instead of centered (still a sheet on a phone). */
  anchor?: PanelAnchor;
  /** Element id for the dialog, so a trigger can point at it with `aria-controls`. */
  id?: string;
  /** Id of the element that describes the dialog. */
  describedBy?: string;
  /** What gets focus on open: the dialog itself, its first tabbable element (default) or a CSS selector. */
  autoFocus?: 'dialog' | 'first-tabbable' | (string & {});
  /** Class of the backdrop (default `ui-dialog-backdrop`). */
  backdropClass?: string;
}

export interface PanelAnchor {
  /** CSS lengths. */
  top: string;
  right: string;
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
  private readonly transloco = inject(TranslocoService);
  private readonly overlay = inject(Overlay);

  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.openConfirm(options);
  }

  confirmTyped(options: TypedConfirmOptions): Promise<boolean> {
    return this.openConfirm(options, options.phrase);
  }

  /**
   * Opens a feature's dialog component with the same rules as the confirmations: focus trap, Escape and a click
   * outside close it, scroll lock, and focus returns to the opener. The component reads `DIALOG_DATA` and closes
   * itself through `DialogRef`. Resolves with what it closed with, or `undefined` on Escape or a click outside.
   */
  async open<R, D, C>(component: ComponentType<C>, options: PanelOptions<D>): Promise<R | undefined> {
    const ref = this.dialog.open<R, D, C>(component, {
      data: options.data,
      role: 'dialog',
      ariaModal: true,
      id: options.id,
      ariaLabelledBy: options.labelledBy,
      ariaDescribedBy: options.describedBy ?? null,
      autoFocus: options.autoFocus ?? 'first-tabbable',
      restoreFocus: true,
      hasBackdrop: true,
      closeOnNavigation: true,
      // The CDK caps dialogs at 80vw by default; these size themselves (a full-width sheet on a phone).
      maxWidth: '100vw',
      // A dialog that takes focus itself shows no ring on its container; the others keep the global focus ring.
      panelClass: options.autoFocus === 'dialog' ? ['ui-panel', 'ui-panel-self-focus'] : 'ui-panel',
      backdropClass: options.backdropClass ?? 'ui-dialog-backdrop',
      positionStrategy: this.position(options.sheetBelow, options.anchor),
    });
    return firstValueFrom(ref.closed);
  }

  private async openConfirm(options: ConfirmOptions, phrase?: string): Promise<boolean> {
    const id = `ui-dialog-${++DialogService.counter}`;
    const data: ConfirmDialogData = {
      title: options.title,
      text: options.text,
      confirmText: options.confirmText ?? this.transloco.translate('common.dialog.confirm'),
      cancelText: options.cancelText ?? this.transloco.translate('common.dialog.cancel'),
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

  /**
   * Centered (or anchored to the top-right) on a large screen, a sheet from the bottom on a phone. Chosen when the
   * dialog opens: resizing across the phone breakpoint while it is open does not move it.
   */
  private position(sheetBelow = 520, anchor?: PanelAnchor) {
    const phone = typeof window !== 'undefined' && !!window.matchMedia?.(`(max-width: ${sheetBelow}px)`).matches;
    const strategy = this.overlay.position().global();
    if (phone) return strategy.centerHorizontally().bottom('0');
    return anchor ? strategy.top(anchor.top).right(anchor.right) : strategy.centerHorizontally().centerVertically();
  }
}
