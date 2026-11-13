import { inject, Injectable } from '@angular/core';
import { TournamentState } from '../../models';
import { publicTournamentState } from '../../public-tournament-state';
import type { ArchiveRepository } from '../../ports/archive.port';
import { toJson } from '../../../shared/parsers/json';
import { SupabaseAuth } from './supabase-auth';
import { AppSupabaseClient, requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SupabaseArchive implements ArchiveRepository {
  private readonly client: AppSupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly auth = inject(SupabaseAuth);

  async recordLocalTournamentMetrics(state: TournamentState, abandoned = false): Promise<void> {
    if (!this.client || state.hostingMode === 'shared' || !state.analyticsId || !state.startedAt) return;
    if (!(await this.auth.currentUser())) await this.auth.signInAnonymously();
    const { error } = await this.requireClient().rpc('record_local_tournament_metrics', {
      p_tournament_id: state.analyticsId,
      p_tournament_mode: state.tournamentMode ?? 'super',
      p_doubles_format: state.doublesFormat ?? 'open',
      p_tournament_size: state.size,
      p_court_count: state.courts,
      p_games_to_win: state.gamesToWin,
      p_round_count: state.rounds.length,
      p_participant_count: state.players.length,
      p_started_at: state.startedAt,
      p_finished_at: state.finishedAt ?? undefined,
      p_abandoned: abandoned,
    });
    if (error) throw error;
  }

  /** Uploads the full tournament (no photos) so the dashboard can reopen it. */
  async saveLocalTournamentArchive(
    tournamentId: string,
    state: TournamentState,
    liveTournamentId?: string,
  ): Promise<void> {
    const client = this.requireClient();
    if (!(await this.auth.currentUser())) await this.auth.signInAnonymously();
    const { error } = await client.rpc('save_local_tournament_archive', {
      p_tournament_id: tournamentId,
      p_state: toJson(publicTournamentState(state)),
      p_live_tournament_id: liveTournamentId,
    });
    if (error) throw error;
  }

  private requireClient(): AppSupabaseClient {
    return requireSupabaseClient(this.client);
  }
}
