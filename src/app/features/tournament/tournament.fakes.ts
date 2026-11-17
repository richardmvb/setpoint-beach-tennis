import type { Provider } from '@angular/core';
import { DialogService } from '../../core/dialog.service';
import { SURVEYS } from '../../core/ports/analytics.port';
import { FakeSurveys } from '../../core/ports/testing/analytics.fake';
import { setupFakes } from '../setup/setup.fakes';

/** What the dialogs of a spec answer, and what was asked of them. */
class FakeDialogs {
  confirmAnswer = true;
  typedAnswer = true;
  /** What `open` resolves with (the tie draw closes with `true` once the finals can be generated). */
  openAnswer: unknown = true;
  /** Runs when a dialog component is opened, to act as the person in it (draw a tie, for example). */
  onOpen: (() => void) | null = null;
  readonly confirms: { title: string; text?: string; confirmText?: string }[] = [];
  readonly typed: { title: string; phrase: string }[] = [];
  readonly opened: unknown[] = [];

  confirm(options: { title: string; text?: string; confirmText?: string }): Promise<boolean> {
    this.confirms.push(options);
    return Promise.resolve(this.confirmAnswer);
  }

  confirmTyped(options: { title: string; phrase: string }): Promise<boolean> {
    this.typed.push(options);
    return Promise.resolve(this.typedAnswer);
  }

  open(component: unknown): Promise<unknown> {
    this.opened.push(component);
    this.onOpen?.();
    return Promise.resolve(this.openAnswer);
  }
}

/** Every port the tournament views use, bound to in-memory fakes (analytics started), for their specs. */
export function tournamentFakes(options: { configured?: boolean } = {}) {
  const base = setupFakes(options);
  const dialogs = new FakeDialogs();
  const surveys = new FakeSurveys();
  const providers: Provider[] = [
    ...base.providers,
    { provide: SURVEYS, useValue: surveys },
    { provide: DialogService, useValue: dialogs },
  ];
  return { ...base, dialogs, surveys, providers };
}
