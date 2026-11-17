import type { TranslocoService } from '@jsverse/transloco';

/**
 * Loads the tournament pages (their code and their text) at once, not on the first click: scoring at the court must
 * keep working after the connection drops, and with no service worker a page that was never opened cannot be fetched.
 */
export function prefetchTournamentViews(transloco: TranslocoService): void {
  void import('../features/tournament/tournament.component').catch(() => undefined);
  void import('../features/tournament/tie-draw-dialog/tie-draw-dialog.component').catch(() => undefined);
  for (const scope of ['organizer/pt-BR', 'tournament/pt-BR'])
    transloco.load(scope).subscribe({ error: () => undefined });
}

/** Loads the profile and library dialogs while online, so they still open at the court without a connection. */
export function prefetchDialogs(): void {
  void import('../features/profile/profile-dialog.component').catch(() => undefined);
  void import('../features/library/library-dialog.component').catch(() => undefined);
}
