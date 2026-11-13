import { inject, Injectable } from '@angular/core';
import { LocalLiveTournamentSnapshot, TournamentState } from '../../models';
import { publicTournamentState } from '../../public-tournament-state';
import type { LocalLiveRepository } from '../../ports/tournaments.port';
import { toJson } from './to-json';
import { parseLocalLiveCreated, parseLocalLiveSnapshot } from '../../../shared/parsers/rpc-responses';
import { SupabaseAuth } from './supabase-auth';
import { AppSupabaseClient, requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';
import { SupabaseFeed } from './supabase-feed';

@Injectable({ providedIn: 'root' })
export class SupabaseLocalLive implements LocalLiveRepository {
  private readonly client: AppSupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly auth = inject(SupabaseAuth);
  private readonly feed = inject(SupabaseFeed);

  async createLocalLiveTournament(
    state: TournamentState,
  ): Promise<{ id: string; readToken: string; writeToken: string }> {
    const client = this.requireClient();
    if (!(await this.auth.currentUser())) {
      const { error: authError } = await client.auth.signInAnonymously();
      if (authError) throw authError;
    }
    const { data, error } = await client.rpc('create_local_live_tournament', {
      p_state: toJson(publicTournamentState(state)),
    });
    if (error) throw error;
    return parseLocalLiveCreated(data);
  }

  async updateLocalLiveTournament(writeToken: string, state: TournamentState): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('update_local_live_tournament', {
      p_write_token: writeToken,
      p_state: toJson(publicTournamentState(state)),
    });
    if (error) throw error;
    return parseLocalLiveSnapshot(data);
  }

  async getLocalLiveTournament(readToken: string): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_local_live_tournament', { p_read_token: readToken });
    if (error) throw error;
    return parseLocalLiveSnapshot(data);
  }

  async syncLocalLiveTournament(
    writeToken: string,
    base: TournamentState,
    state: TournamentState,
  ): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('sync_local_live_tournament', {
      p_write_token: writeToken,
      p_base_state: toJson(base),
      p_state: toJson(publicTournamentState(state)),
    });
    if (error) throw error;
    const snapshot = parseLocalLiveSnapshot(data);
    void this.feed.notifyLocal(snapshot.id).catch(() => undefined);
    return snapshot;
  }

  private requireClient(): AppSupabaseClient {
    return requireSupabaseClient(this.client);
  }
}
