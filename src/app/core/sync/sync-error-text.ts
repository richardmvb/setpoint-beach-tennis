import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { SyncErrorKey } from './tournament-sync';

/** The words for a sync error key (`shell.syncError.<key>` in the root pt-BR file), for screens that show it. */
@Injectable({ providedIn: 'root' })
export class SyncErrorText {
  private readonly transloco = inject(TranslocoService);

  text(key: SyncErrorKey | null): string {
    switch (key) {
      case null:
        return '';
      case 'queueUnavailable':
        return this.transloco.translate('shell.syncError.queueUnavailable');
      case 'prefsNotSaved':
        return this.transloco.translate('shell.syncError.prefsNotSaved');
      case 'prepareFailed':
        return this.transloco.translate('shell.syncError.prepareFailed');
      case 'notStaged':
        return this.transloco.translate('shell.syncError.notStaged');
      case 'queueNotSaved':
        return this.transloco.translate('shell.syncError.queueNotSaved');
      case 'queueNotCleared':
        return this.transloco.translate('shell.syncError.queueNotCleared');
      case 'conflict':
        return this.transloco.translate('shell.syncError.conflict');
      case 'expired':
        return this.transloco.translate('shell.syncError.expired');
      case 'failed':
        return this.transloco.translate('shell.syncError.failed');
    }
  }
}
