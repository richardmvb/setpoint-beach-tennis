import { inject, Injectable } from '@angular/core';
import { TournamentArchive } from './archive/tournament-archive';
import { CurrentTournament } from './current-tournament';
import { LocalLiveLink } from './local-live-link';
import { Notices } from './notices';
import { publicTournamentState } from './public-tournament-state';
import { TournamentSync } from './sync/tournament-sync';
import { StorageService } from './storage.service';

/**
 * Saves the tournament in use: the sync queue, this device's storage, the "Meus torneios" library and the archive
 * upload. Whoever changes the tournament calls `save` after replacing it. It also reacts when the live link is created,
 * because that is a change that must be saved in the same order (queue first, then the save, then the archive).
 */
@Injectable({ providedIn: 'root' })
export class TournamentPersistence {
  private readonly tournament = inject(CurrentTournament);
  private readonly sync = inject(TournamentSync);
  private readonly archive = inject(TournamentArchive);
  private readonly notices = inject(Notices);
  private readonly storage = inject(StorageService);

  constructor() {
    inject(LocalLiveLink).published$.subscribe(({ analyticsId, published }) => {
      try {
        this.sync.initialize('local', analyticsId, publicTournamentState(published));
      } catch {
        // A subscriber's error would not reach the caller: the person sees it as a sync error instead.
        this.sync.fail('queueNotSaved');
      }
      this.save();
      this.archive.requeue(analyticsId);
      void this.archive.flush();
    });
  }

  /** `success` is the message to show once it is stored; `archive` false skips the library and the upload. */
  save(success?: string, archive = true): void {
    this.sync.stage(this.tournament.state());
    try {
      this.storage.saveTournament(this.tournament.state());
      if (success) this.notices.show(success);
    } catch (error) {
      if (error instanceof Error) this.notices.show(error.message, 'error');
      else this.notices.showKey('saveFailed', 'error');
    }
    if (archive) this.archive.archiveCurrent();
  }
}
