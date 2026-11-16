import { DIALOG_DATA } from '@angular/cdk/dialog';
import { inject, Injectable, signal } from '@angular/core';
import { DialogService } from '../../../core/dialog.service';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { SavedTournaments } from '../../../core/saved-tournaments';
import type { LibraryEntry } from '../../../core/tournament-library';

export interface LibraryDialogData {
  /** `libraryId` of the tournament in use on this device, or null. */
  currentId: string | null;
  /** Opens a saved tournament (the shell asks to discard unsynced work and swaps it in). True when it did. */
  open(id: string): Promise<boolean>;
}

/** The words of the delete confirmation, translated by the template and handed to the store with the click. */
export interface DeleteTexts {
  title: string;
  text: string;
  confirmText: string;
}

/** The saved-tournaments list's state and actions. Provided by `LibraryDialogComponent`. */
@Injectable()
export class LibraryStore {
  private readonly data = inject<LibraryDialogData>(DIALOG_DATA);
  private readonly saved = inject(SavedTournaments);
  private readonly dialog = inject(DialogService);
  private readonly analytics = inject(ANALYTICS);

  readonly entries = this.saved.entries;
  /** The tournament in use cannot be deleted: the list says so. */
  readonly deleteBlocked = signal(false);

  constructor() {
    this.saved.refresh();
    this.analytics.capture('tournament_library_opened', { entries: this.saved.entries().length });
  }

  isCurrent(entry: LibraryEntry): boolean {
    return entry.id === this.data.currentId;
  }

  /** True when the tournament was opened, so the dialog can close. */
  open(id: string): Promise<boolean> {
    this.deleteBlocked.set(false);
    return this.data.open(id);
  }

  async remove(entry: LibraryEntry, texts: DeleteTexts): Promise<void> {
    if (this.isCurrent(entry)) {
      this.deleteBlocked.set(true);
      return;
    }
    this.deleteBlocked.set(false);
    if (!(await this.dialog.confirm({ ...texts, tone: 'danger' }))) return;
    this.saved.remove(entry.id);
    this.analytics.capture('tournament_library_deleted', { phase: entry.phase, hosting_mode: entry.hosting });
  }
}
