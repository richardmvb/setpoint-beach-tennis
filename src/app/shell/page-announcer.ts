import { DOCUMENT, inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { Observable } from 'rxjs';
import { take } from 'rxjs';

/** What the shell is showing, for the document title: a page of the app, or one of the screens around it. */
export type ScreenKey =
  | 'lock'
  | 'landing'
  | 'dashboard'
  | 'shared'
  | 'setup'
  | 'overview'
  | 'players'
  | 'rounds'
  | 'ranking'
  | 'projection'
  | 'settings';

const FOCUS_ATTEMPTS = 30;

/**
 * Tells people who cannot see the screen that it changed: sets `document.title` for the screen and, when the screen
 * changes while they are using the app, moves focus to its `h1` so a screen reader reads it and the keyboard starts at
 * the top. The first announcement (the page just loaded) only sets the title. Focus is left alone while a dialog is open
 * or when the person is typing in a field.
 */
@Injectable({ providedIn: 'root' })
export class PageAnnouncer {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private current: ScreenKey | null = null;

  announce(screen: ScreenKey): void {
    if (screen === this.current) return;
    const first = this.current === null;
    this.current = screen;
    this.title(screen)
      .pipe(take(1))
      .subscribe((title) => {
        if (this.current === screen) this.document.title = title;
      });
    if (!first) this.focusHeading(screen);
  }

  private title(screen: ScreenKey): Observable<string> {
    switch (screen) {
      case 'lock':
        return this.transloco.selectTranslate('shell.title.lock');
      case 'landing':
        return this.transloco.selectTranslate('shell.title.landing');
      case 'dashboard':
        return this.transloco.selectTranslate('shell.title.dashboard');
      case 'shared':
        return this.transloco.selectTranslate('shell.title.shared');
      case 'setup':
        return this.transloco.selectTranslate('shell.title.setup');
      case 'overview':
        return this.transloco.selectTranslate('shell.title.overview');
      case 'players':
        return this.transloco.selectTranslate('shell.title.players');
      case 'rounds':
        return this.transloco.selectTranslate('shell.title.rounds');
      case 'ranking':
        return this.transloco.selectTranslate('shell.title.ranking');
      case 'projection':
        return this.transloco.selectTranslate('shell.title.projection');
      case 'settings':
        return this.transloco.selectTranslate('shell.title.settings');
    }
  }

  /** The screen renders a moment later (a lazy feature may still be loading), so look for its heading for a while. */
  private focusHeading(screen: ScreenKey, attempt = 0): void {
    if (this.current !== screen) return;
    const heading = this.document.querySelector<HTMLElement>('h1');
    if (heading) {
      if (this.mayMoveFocus()) {
        heading.tabIndex = -1;
        heading.focus();
      }
      return;
    }
    if (attempt < FOCUS_ATTEMPTS) requestAnimationFrame(() => this.focusHeading(screen, attempt + 1));
  }

  private mayMoveFocus(): boolean {
    if (this.document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
    const active = this.document.activeElement;
    return !(
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    );
  }
}
