import { Injectable } from '@angular/core';
import { createClient, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { SharedTournamentSnapshot, TournamentState } from './models';

interface SetpointRuntimeConfig {
  supabaseUrl?: string;
  publishableKey?: string;
}

declare global {
  interface Window {
    __SETPOINT_CONFIG__?: SetpointRuntimeConfig;
  }
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

  async currentUser(): Promise<User | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user;
  }

  async requestModeratorLogin(email: string, redirectTo: string): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async createSharedTournament(
    state: TournamentState, moderatorName: string
  ): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('create_shared_tournament', {
      p_name: state.name,
      p_capacity: state.size,
      p_moderator_name: moderatorName,
      p_initial_state: state
    });
    if (error) throw error;
    return data as SharedTournamentSnapshot;
  }

  async joinSharedTournament(inviteToken: string, displayName: string): Promise<SharedTournamentSnapshot> {
    const joinId = await this.getOrCreateJoinId(inviteToken);
    const { data, error } = await this.requireClient().rpc('join_shared_tournament', {
      p_invite_token: inviteToken,
      p_display_name: displayName,
      p_join_id: joinId
    });
    if (error) throw error;
    await this.saveGuestName(inviteToken, displayName);
    await this.broadcastRefresh((data as SharedTournamentSnapshot).id);
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
    await this.broadcastRefresh(id);
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
    const client = this.requireClient();
    const channel = client.channel(`shared-tournament:${id}`);
    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          const result = await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
          await client.removeChannel(channel);
          if (result === 'ok') resolve();
          else reject(new Error('Não foi possível notificar os espectadores.'));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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