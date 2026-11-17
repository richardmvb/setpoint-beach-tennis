import { computed, inject, Injectable } from '@angular/core';
import { ThemeService } from '../core/theme';
import { TournamentSync } from '../core/sync/tournament-sync';
import type { ProfileShellState } from '../features/profile/data/profile-panel.store';
import type { TournamentShellState } from '../features/tournament/data/tournament.store';

/**
 * What the shell knows that the features show: the state of the sync and the theme, derived from the services' signals.
 * The tournament pages get `tournament` as their `shell` input; the profile panel reads `profile`. Both only change when
 * a field does, so the views they feed stay still.
 */
@Injectable({ providedIn: 'root' })
export class ShellState {
  private readonly sync = inject(TournamentSync);
  private readonly theme = inject(ThemeService);

  readonly tournament = computed<TournamentShellState>(
    () => ({
      syncAvailable: this.sync.available(),
      syncStatus: this.sync.status(),
      hasPendingSync: this.sync.hasPending(),
      syncPaused: this.sync.paused(),
      syncing: this.sync.inFlight(),
      online: this.sync.online(),
      syncError: this.sync.error(),
      theme: this.theme.mode(),
    }),
    {
      equal: (a, b) =>
        a.syncAvailable === b.syncAvailable &&
        a.syncStatus === b.syncStatus &&
        a.hasPendingSync === b.hasPendingSync &&
        a.syncPaused === b.syncPaused &&
        a.syncing === b.syncing &&
        a.online === b.online &&
        a.syncError === b.syncError &&
        a.theme === b.theme,
    },
  );

  readonly profile = computed<ProfileShellState>(
    () => {
      const shell = this.tournament();
      return {
        sync: shell.syncStatus,
        syncWarning:
          shell.hasPendingSync || !!shell.syncError || (shell.syncAvailable && (!shell.online || shell.syncPaused)),
        syncError: shell.syncError,
        theme: shell.theme,
      };
    },
    {
      equal: (a, b) =>
        a.sync === b.sync && a.syncWarning === b.syncWarning && a.syncError === b.syncError && a.theme === b.theme,
    },
  );
}
