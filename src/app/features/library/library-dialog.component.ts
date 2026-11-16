import { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { PhaseLabelComponent } from '../tournament/phase-label.component';
import type { LibraryEntry } from '../../core/tournament-library';
import { LibraryStore } from './data/library.store';

/** Id of the dialog's title, which names it (aria-labelledby). */
export const LIBRARY_TITLE_ID = 'libraryTitle';

/**
 * "Meus torneios": every tournament started on this device, to open or delete. Open it with `DialogService.open`
 * (focus trap, Escape and a click outside close it) and the `ui-backdrop-plain` backdrop; its data is
 * `LibraryDialogData`. The frame is the global `.batch-modal` look, the list is this component's own CSS.
 */
@Component({
  selector: 'app-library-dialog',
  imports: [TranslocoDirective, DatePipe, ButtonComponent, PhaseLabelComponent],
  providers: [LibraryStore, provideTranslocoScope('library')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'batch-modal' },
  templateUrl: './library-dialog.component.html',
  styleUrl: './library-dialog.component.css',
})
export class LibraryDialogComponent {
  protected readonly store = inject(LibraryStore);
  private readonly ref = inject(DialogRef);
  private readonly transloco = inject(TranslocoService);
  protected readonly titleId = LIBRARY_TITLE_ID;

  protected close(): void {
    this.ref.close();
  }

  protected async open(id: string): Promise<void> {
    if (await this.store.open(id)) this.ref.close();
  }

  protected remove(entry: LibraryEntry): Promise<void> {
    const { name } = entry;
    return this.store.remove(entry, {
      title: this.transloco.translate('confirmDelete.title', {}, 'library/pt-BR'),
      text: this.transloco.translate('confirmDelete.text', { name }, 'library/pt-BR'),
      confirmText: this.transloco.translate('confirmDelete.confirm', {}, 'library/pt-BR'),
    });
  }
}
