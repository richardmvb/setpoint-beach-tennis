import { Injectable } from '@angular/core';
import { createClient, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { LocalLiveTournamentSnapshot, PlayerGender, SharedTournamentSnapshot, TournamentState } from './models';

export interface DashboardMetrics {
  tournaments_total: number;
  tournaments_started: number;
  tournaments_completed: number;
  tournaments_active: number;
  tournaments_archived: number;
  tournaments_abandoned: number;
  tournaments_size_24: number;
  super_tournaments: number;
  group_tournaments: number;
  mixed_tournaments: number;
  open_tournaments: number;
  participants_total: number;
  participants_invited: number;
  participants_manual: number;
  moderators_total: number;
  moderators_returned: number;
  completion_rate: number | null;
  average_duration_seconds: number | null;
}

export type DashboardTournamentSource = 'shared' | 'local';

export interface DashboardActiveTournament {
  id: string;
  source: DashboardTournamentSource;
  name: string;
  size: number;
  mode: string;
  updated_at: string;
  matches_completed: number;
  matches_total: number;
}

export interface DashboardActivity {
  active_tournaments: DashboardActiveTournament[];
  archived_tournaments: DashboardActiveTournament[];
  abandoned_registration: number;
  abandoned_no_scores: number;
  abandoned_under_half: number;
  abandoned_over_half: number;
  abandoned_rounds_complete: number;
  abandoned_finals: number;
  abandoned_unknown: number;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client: SupabaseClient | null;
  private readonly channels = new Map<string, RealtimeChannel>();

  constructor() {
    const config = window.__SETPOINT_CONFIG__;
    const supabaseUrl = config?.supabaseUrl?.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const publishableKey = config?.publishableKey;
    if (!supabaseUrl || !publishableKey) {
      this.client = null;
      return;
    }
    this.client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  get isConfigured(): boolean { return this.client !== null; }

  async finishUrlSignIn(): Promise<void> {
    try {
      await this.client?.auth.initialize();
    } finally {
      if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    }
  }

  async currentUser(): Promise<User | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user;
  }

  onAuthStateChange(callback: (event: string, user: User | null) => void): () => void {
    if (!this.client) return () => undefined;
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestModeratorLogin(email: string, redirectTo: string): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
  }

  async signInAnonymously(): Promise<void> {
    const { error } = await this.requireClient().auth.signInAnonymously();
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async createSharedTournament(
    state: TournamentState, moderatorName: string, moderatorGender: PlayerGender = 'male', moderatorPhoto?: string
  ): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('create_shared_tournament', {
      p_name: state.name,
      p_capacity: state.size,
      p_moderator_name: moderatorName,
      p_moderator_gender: moderatorGender,
      p_initial_state: { ...state, moderatorAvatarDataUrl: moderatorPhoto ?? null }
    });
    if (error) throw error;
    return data as SharedTournamentSnapshot;
  }

  async joinSharedTournament(inviteToken: string, displayName: string, gender: PlayerGender = 'male', photoDataUrl?: string): Promise<SharedTournamentSnapshot> {
    const joinId = await this.getOrCreateJoinId(inviteToken);
    const { data, error } = await this.requireClient().rpc('join_shared_tournament', {
      p_invite_token: inviteToken,
      p_display_name: displayName,
      p_gender: gender,
      p_join_id: joinId,
      p_avatar_data: photoDataUrl ?? null
    });
    if (error) throw error;
    await this.saveGuestName(inviteToken, displayName);
    void this.broadcastRefresh((data as SharedTournamentSnapshot).id).catch(() => undefined);
    return data as SharedTournamentSnapshot;
  }

  async getGuestName(inviteToken: string): Promise<string> {
    const key = await this.guestStorageKey(inviteToken);
    try {
      const saved = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      return saved ? (JSON.parse(saved) as { displayName?: string }).displayName ?? '' : '';
    } catch { return ''; }
  }

  async getSharedTournament(inviteToken: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_shared_tournament', {
      p_invite_token: inviteToken
    });
    if (error) throw error;
    return data as SharedTournamentSnapshot;
  }

  async getOwnedSharedTournament(id: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_owned_shared_tournament', {
      p_tournament_id: id
    });
    if (error) throw error;
    return data as SharedTournamentSnapshot;
  }

  async createLocalLiveTournament(state: TournamentState): Promise<{ id: string; readToken: string; writeToken: string }> {
    const client = this.requireClient();
    if (!(await this.currentUser())) {
      const { error: authError } = await client.auth.signInAnonymously();
      if (authError) throw authError;
    }
    const { data, error } = await client.rpc('create_local_live_tournament', {
      p_state: this.publicTournamentState(state)
    });
    if (error) throw error;
    return data as { id: string; readToken: string; writeToken: string };
  }

  async updateLocalLiveTournament(writeToken: string, state: TournamentState): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('update_local_live_tournament', {
      p_write_token: writeToken,
      p_state: this.publicTournamentState(state)
    });
    if (error) throw error;
    return data as LocalLiveTournamentSnapshot;
  }

  async getLocalLiveTournament(readToken: string): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_local_live_tournament', { p_read_token: readToken });
    if (error) throw error;
    return data as LocalLiveTournamentSnapshot;
  }

  async syncLocalLiveTournament(writeToken: string, base: TournamentState, state: TournamentState): Promise<LocalLiveTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('sync_local_live_tournament', {
      p_write_token: writeToken,
      p_base_state: base,
      p_state: this.publicTournamentState(state)
    });
    if (error) throw error;
    const snapshot = data as LocalLiveTournamentSnapshot;
    void this.notifyLocalLiveTournament(snapshot.id).catch(() => undefined);
    return snapshot;
  }

  subscribeToLocalLiveTournament(id: string, onChange: () => void): void {
    const client = this.requireClient();
    const key = `local-live:${id}`;
    const previous = this.channels.get(key);
    if (previous) void client.removeChannel(previous);
    const channel = client.channel(key)
      .on('broadcast', { event: 'refresh' }, onChange)
      .subscribe();
    this.channels.set(key, channel);
  }

  async notifyLocalLiveTournament(id: string): Promise<void> {
    const key = `local-live:${id}`;
    const subscribed = this.channels.get(key);
    if (subscribed) {
      await subscribed.send({ type: 'broadcast', event: 'refresh', payload: {} });
      return;
    }
    const client = this.requireClient();
    const channel = client.channel(key);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { void client.removeChannel(channel); reject(new Error('Live update timeout.')); }, 5000);
      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          const result = await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
          clearTimeout(timeout);
          await client.removeChannel(channel);
          if (result === 'ok') resolve();
          else reject(new Error('Live update failed.'));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          await client.removeChannel(channel);
          reject(new Error('Live channel unavailable.'));
        }
      });
    });
  }

  publicTournamentState(state: TournamentState): TournamentState {
    return {
      ...state,
      analyticsId: undefined,
      players: state.players.map(({ photoDataUrl: _photoDataUrl, ...player }) => player)
    };
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const { data, error } = await this.requireClient().rpc('get_dashboard_metrics');
    if (error) throw error;
    return data as DashboardMetrics;
  }

  async getDashboardActivity(): Promise<DashboardActivity> {
    const { data, error } = await this.requireClient().rpc('get_dashboard_activity');
    if (error) throw error;
    return data as DashboardActivity;
  }

  async getDashboardTournament(source: DashboardTournamentSource, id: string): Promise<Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>> {
    const { data, error } = await this.requireClient().rpc('get_dashboard_tournament', {
      p_source: source,
      p_tournament_id: id
    });
    if (error) throw error;
    return data as Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>;
  }

  async recordLocalTournamentMetrics(state: TournamentState, abandoned = false): Promise<void> {
    if (!this.client || state.hostingMode === 'shared' || !state.analyticsId || !state.startedAt) return;
    if (!await this.currentUser()) await this.signInAnonymously();
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
      p_finished_at: state.finishedAt ?? null,
      p_abandoned: abandoned,
    });
    if (error) throw error;
  }

  async addSharedParticipant(id: string, displayName: string, gender: PlayerGender = 'male', photoDataUrl?: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('add_shared_participant', {
      p_tournament_id: id,
      p_display_name: displayName,
      p_gender: gender,
      p_avatar_data: photoDataUrl ?? null
    });
    if (error) throw error;
    await this.broadcastRefresh(id);
    return data as SharedTournamentSnapshot;
  }

  async removeSharedParticipant(id: string, playerId: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('remove_shared_participant', {
      p_tournament_id: id,
      p_player_id: playerId
    });
    if (error) throw error;
    await this.broadcastRefresh(id);
    return data as SharedTournamentSnapshot;
  }

  async cancelSharedTournament(id: string): Promise<void> {
    const { error } = await this.requireClient().rpc('cancel_shared_tournament', { p_tournament_id: id });
    if (error) throw error;
    await this.broadcastRefresh(id).catch(() => undefined);
  }

  async rotateSharedInvite(id: string): Promise<{ inviteToken: string; inviteExpiresAt: string }> {
    const { data, error } = await this.requireClient().rpc('rotate_shared_invite', {
      p_tournament_id: id
    });
    if (error) throw error;
    return data as { inviteToken: string; inviteExpiresAt: string };
  }

  async startSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('start_shared_tournament', {
      p_tournament_id: id,
      p_state: state
    });
    if (error) throw error;
    void this.broadcastRefresh(id).catch(() => undefined);
    return data as SharedTournamentSnapshot;
  }

  async saveSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('save_shared_tournament', {
      p_tournament_id: id,
      p_state: state
    });
    if (error) throw error;
    await this.broadcastRefresh(id);
    return data as SharedTournamentSnapshot;
  }

  async syncSharedTournament(id: string, base: TournamentState, state: TournamentState): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('sync_shared_tournament', {
      p_tournament_id: id,
      p_base_state: base,
      p_state: state
    });
    if (error) throw error;
    void this.broadcastRefresh(id).catch(() => undefined);
    return data as SharedTournamentSnapshot;
  }

  subscribeToSharedTournament(id: string, onChange: () => void): RealtimeChannel {
    const client = this.requireClient();
    this.unsubscribeFromSharedTournament(id);
    const channel = client.channel(`shared-tournament:${id}`)
      .on('broadcast', { event: 'refresh' }, onChange)
      .subscribe();
    this.channels.set(id, channel);
    return channel;
  }

  async notifySharedTournament(id: string): Promise<void> {
    const channel = this.channels.get(id);
    if (!channel) return;
    await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
  }

  unsubscribeFromSharedTournament(id: string): void {
    const channel = this.channels.get(id);
    if (!channel || !this.client) return;
    this.channels.delete(id);
    void this.client.removeChannel(channel);
  }

  async broadcastRefresh(id: string): Promise<void> {
    const subscribed = this.channels.get(id);
    if (subscribed) {
      if (await subscribed.send({ type: 'broadcast', event: 'refresh', payload: {} }) !== 'ok') {
        throw new Error('Não foi possível notificar os espectadores.');
      }
      return;
    }
    const client = this.requireClient();
    const channel = client.channel(`shared-tournament:${id}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { void client.removeChannel(channel); reject(new Error('Tempo esgotado ao notificar os espectadores.')); }, 5000);
      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          const result = await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
          clearTimeout(timeout);
          await client.removeChannel(channel);
          if (result === 'ok') resolve();
          else reject(new Error('Não foi possível notificar os espectadores.'));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          await client.removeChannel(channel);
          reject(new Error('Não foi possível conectar ao canal de atualizações.'));
        }
      });
    });
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('O modo compartilhado ainda não está configurado neste deploy.');
    return this.client;
  }

  private async getOrCreateJoinId(inviteToken: string): Promise<string> {
    const key = await this.guestStorageKey(inviteToken);
    try {
      const saved = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      const current = saved ? (JSON.parse(saved) as { joinId?: string }).joinId : null;
      if (current) return current;
      const created = globalThis.crypto.randomUUID();
      this.writeGuestRecord(key, { joinId: created });
      return created;
    } catch {
      return globalThis.crypto.randomUUID();
    }
  }

  private async saveGuestName(inviteToken: string, displayName: string): Promise<void> {
    const key = await this.guestStorageKey(inviteToken);
    let joinId: string | undefined;
    try {
      const saved = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      joinId = saved ? (JSON.parse(saved) as { joinId?: string }).joinId : undefined;
    } catch { /* session storage below remains a fallback */ }
    this.writeGuestRecord(key, { joinId, displayName });
  }

  private writeGuestRecord(key: string, value: { joinId?: string; displayName?: string }): void {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {
      try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* server still validates token and capacity */ }
    }
  }

  private async guestStorageKey(inviteToken: string): Promise<string> {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(inviteToken));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      return `setpoint.shared.guest.${hash}`;
    } catch {
      return `setpoint.shared.guest.${inviteToken.slice(-16)}`;
    }
  }
}