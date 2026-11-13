import { InjectionToken } from '@angular/core';
import type { TournamentState } from '../models';

/** Cloud copies of local tournaments, kept so the dashboard can count and reopen them. */
export interface ArchiveRepository {
  recordLocalTournamentMetrics(state: TournamentState, abandoned?: boolean): Promise<void>;
  /** Uploads the full tournament (no photos) so the dashboard can reopen it. */
  saveLocalTournamentArchive(tournamentId: string, state: TournamentState, liveTournamentId?: string): Promise<void>;
}
export const ARCHIVE = new InjectionToken<ArchiveRepository>('ArchiveRepository');
