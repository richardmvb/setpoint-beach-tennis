import { inject, Injectable } from '@angular/core';
import { CurrentTournament } from '../current-tournament';
import { LocalLiveLink } from '../local-live-link';
import type { TournamentState } from '../models';
import { ARCHIVE } from '../ports/archive.port';
import { AUTH } from '../ports/auth.port';
import { CLOCK } from '../ports/clock.port';
import { CONNECTIVITY } from '../ports/connectivity.port';
import { RANDOM } from '../ports/random.port';
import { AppNavigation } from '../routing/app-navigation';
import { SavedTournaments } from '../saved-tournaments';
import { ShellContext } from '../shell-context';
import { StorageService } from '../storage.service';

const BACK_OFF = 60_000;

/**
 * What this device sends to the cloud for the dashboard, besides the live sync: the copy of each local tournament
 * ("Meus torneios" entries not yet uploaded) and its usage metrics. Everything here is best effort: the library is a
 * safety net, and a failure leaves the data on the device and tries again on reconnect, on change and on launch.
 */
@Injectable({ providedIn: 'root' })
export class TournamentArchive {
  private readonly tournament = inject(CurrentTournament);
  private readonly saved = inject(SavedTournaments);
  private readonly liveLink = inject(LocalLiveLink);
  private readonly navigation = inject(AppNavigation);
  private readonly context = inject(ShellContext);
  private readonly connectivity = inject(CONNECTIVITY);
  private readonly auth = inject(AUTH);
  private readonly archive = inject(ARCHIVE);
  private readonly clock = inject(CLOCK);
  private readonly random = inject(RANDOM);
  private readonly storage = inject(StorageService);
  private inFlight = false;
  private retryAfter = 0;

  /** Saves a tournament in "Meus torneios". Best-effort: the library must never break scoring. */
  keep(state: TournamentState, alreadyOnServer = false): void {
    try {
      if (state.hostingMode !== 'shared' && state.rounds.length && !state.analyticsId) {
        if (state === this.tournament.state()) {
          this.tournament.ensureAnalyticsId();
          state = this.tournament.state();
        } else state = { ...state, analyticsId: this.random.uuid() };
      }
      const entry = this.saved.library.save(state);
      if (entry && alreadyOnServer) this.saved.library.markArchived(entry.id, entry.updatedAt);
    } catch {
      /* histórico é opcional */
    }
  }

  /** Keeps the tournament in use in the library and uploads what is unsent. */
  archiveCurrent(): void {
    if (this.navigation.dashboardRoute()) return;
    this.keep(this.tournament.state());
    this.saved.refresh();
    void this.flush();
  }

  /** Marks an entry as not uploaded, so the next flush sends it (its live link was just created). */
  requeue(analyticsId: string): void {
    this.saved.library.requeue(analyticsId);
  }

  /** Uploads every unsent local tournament, in order. */
  async flush(): Promise<void> {
    if (
      this.inFlight ||
      this.clock.now() < this.retryAfter ||
      !this.connectivity.online() ||
      !this.auth.configured ||
      this.context.isSharedView ||
      this.navigation.dashboardRoute()
    )
      return;
    const library = this.saved.library;
    this.inFlight = true;
    try {
      for (let pending = library.pendingArchives(); pending.length; pending = library.pendingArchives()) {
        const entry = pending[0];
        const saved = library.load(entry.id);
        if (saved)
          await this.archive.saveLocalTournamentArchive(entry.id, saved, this.liveLink.storedId(saved.analyticsId));
        // Keeps the flag when the entry changed mid-upload, so the next pass sends the newer copy.
        library.markArchived(entry.id, entry.updatedAt);
      }
    } catch {
      // Data stays on the device. Back off so a missing migration or an outage does not fire a request per score.
      this.retryAfter = this.clock.now() + BACK_OFF;
    } finally {
      this.inFlight = false;
    }
  }

  /** Reports a started local tournament to the usage metrics (`abandoned` when it is being thrown away). */
  recordMetrics(abandoned = false): void {
    const state = this.tournament.state();
    if (state.hostingMode === 'shared' || !state.startedAt) return;
    this.tournament.ensureAnalyticsId();
    const snapshot = { ...this.tournament.state() };
    void this.archive.recordLocalTournamentMetrics(snapshot, abandoned).catch(() => undefined);
  }

  /** A local tournament started before the metrics existed is reported once the device can save it. */
  backfillMetrics(): void {
    const state = this.tournament.state();
    if (state.hostingMode === 'shared' || !state.startedAt || !state.rounds.length) return;
    this.tournament.ensureAnalyticsId();
    try {
      this.storage.saveTournament(this.tournament.state());
    } catch {
      return;
    }
    this.recordMetrics();
  }
}
