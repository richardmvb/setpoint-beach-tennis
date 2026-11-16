import { inject, Injectable, signal } from '@angular/core';
import { CLOCK } from './ports/clock.port';
import { LOCAL_STORE } from './ports/key-value-store.port';
import { StorageService } from './storage.service';
import { type LibraryEntry, TournamentLibrary } from './tournament-library';

/**
 * The tournaments saved on this device ("Meus torneios"): the one `TournamentLibrary` over `LOCAL_STORE`, plus the
 * list the screens show. The shell saves, archives and reopens through `library`; the library dialog and the
 * profile panel read `entries` and delete through `remove`. Call `refresh()` after anything that changes the list.
 */
@Injectable({ providedIn: 'root' })
export class SavedTournaments {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(CLOCK);
  readonly library = new TournamentLibrary(
    inject(LOCAL_STORE),
    (raw) => this.storage.parseTournament(raw),
    undefined,
    () => this.clock.date(),
  );
  private readonly list = signal<LibraryEntry[]>([]);

  /** Newest first. */
  readonly entries = this.list.asReadonly();

  refresh(): void {
    try {
      this.list.set(this.library.list());
    } catch {
      this.list.set([]);
    }
  }

  remove(id: string): void {
    this.library.remove(id);
    this.refresh();
  }
}
