import { inject, Injectable } from '@angular/core';
import { PlayerGender, SharedTournamentSnapshot, TournamentState } from '../../models';
import { LOCAL_STORE, SESSION_STORE } from '../../ports/key-value-store.port';
import type { SharedTournamentRepository } from '../../ports/tournaments.port';
import { isRecord, parseJson } from '../../../shared/parsers/json';
import { toJson } from './to-json';
import { parseInviteRotation, parseSharedSnapshot } from '../../../shared/parsers/rpc-responses';
import { AppSupabaseClient, requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';
import { SupabaseFeed } from './supabase-feed';

function readString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '';
}

@Injectable({ providedIn: 'root' })
export class SupabaseSharedTournaments implements SharedTournamentRepository {
  private readonly client: AppSupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly feed = inject(SupabaseFeed);
  private readonly local = inject(LOCAL_STORE);
  private readonly session = inject(SESSION_STORE);

  async createSharedTournament(
    state: TournamentState,
    moderatorName: string,
    moderatorGender: PlayerGender = 'male',
    moderatorPhoto?: string,
  ): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('create_shared_tournament', {
      p_name: state.name,
      p_capacity: state.size,
      p_moderator_name: moderatorName,
      p_moderator_gender: moderatorGender,
      p_initial_state: toJson({ ...state, moderatorAvatarDataUrl: moderatorPhoto ?? null }),
    });
    if (error) throw error;
    return parseSharedSnapshot(data);
  }

  async joinSharedTournament(
    inviteToken: string,
    displayName: string,
    gender: PlayerGender = 'male',
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot> {
    const joinId = await this.getOrCreateJoinId(inviteToken);
    const { data, error } = await this.requireClient().rpc('join_shared_tournament', {
      p_invite_token: inviteToken,
      p_display_name: displayName,
      p_gender: gender,
      p_join_id: joinId,
      p_avatar_data: photoDataUrl ?? null,
    });
    if (error) throw error;
    await this.saveGuestName(inviteToken, displayName);
    void this.feed.broadcastShared(parseSharedSnapshot(data).id).catch(() => undefined);
    return parseSharedSnapshot(data);
  }

  async getGuestName(inviteToken: string): Promise<string> {
    const key = await this.guestStorageKey(inviteToken);
    try {
      const saved = this.local.getItem(key) ?? this.session.getItem(key);
      return saved ? readString(parseJson(saved), 'displayName') : '';
    } catch {
      return '';
    }
  }

  async getSharedTournament(inviteToken: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_shared_tournament', {
      p_invite_token: inviteToken,
    });
    if (error) throw error;
    return parseSharedSnapshot(data);
  }

  async getOwnedSharedTournament(id: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('get_owned_shared_tournament', {
      p_tournament_id: id,
    });
    if (error) throw error;
    return parseSharedSnapshot(data);
  }

  async addSharedParticipant(
    id: string,
    displayName: string,
    gender: PlayerGender = 'male',
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('add_shared_participant', {
      p_tournament_id: id,
      p_display_name: displayName,
      p_gender: gender,
      p_avatar_data: photoDataUrl ?? null,
    });
    if (error) throw error;
    await this.feed.broadcastShared(id);
    return parseSharedSnapshot(data);
  }

  async removeSharedParticipant(id: string, playerId: string): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('remove_shared_participant', {
      p_tournament_id: id,
      p_player_id: playerId,
    });
    if (error) throw error;
    await this.feed.broadcastShared(id);
    return parseSharedSnapshot(data);
  }

  async cancelSharedTournament(id: string): Promise<void> {
    const { error } = await this.requireClient().rpc('cancel_shared_tournament', { p_tournament_id: id });
    if (error) throw error;
    await this.feed.broadcastShared(id).catch(() => undefined);
  }

  async rotateSharedInvite(id: string): Promise<{ inviteToken: string; inviteExpiresAt: string }> {
    const { data, error } = await this.requireClient().rpc('rotate_shared_invite', {
      p_tournament_id: id,
    });
    if (error) throw error;
    return parseInviteRotation(data);
  }

  async startSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('start_shared_tournament', {
      p_tournament_id: id,
      p_state: toJson(state),
    });
    if (error) throw error;
    void this.feed.broadcastShared(id).catch(() => undefined);
    return parseSharedSnapshot(data);
  }

  async saveSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('save_shared_tournament', {
      p_tournament_id: id,
      p_state: toJson(state),
    });
    if (error) throw error;
    await this.feed.broadcastShared(id);
    return parseSharedSnapshot(data);
  }

  async syncSharedTournament(
    id: string,
    base: TournamentState,
    state: TournamentState,
  ): Promise<SharedTournamentSnapshot> {
    const { data, error } = await this.requireClient().rpc('sync_shared_tournament', {
      p_tournament_id: id,
      p_base_state: toJson(base),
      p_state: toJson(state),
    });
    if (error) throw error;
    void this.feed.broadcastShared(id).catch(() => undefined);
    return parseSharedSnapshot(data);
  }

  private async getOrCreateJoinId(inviteToken: string): Promise<string> {
    const key = await this.guestStorageKey(inviteToken);
    try {
      const saved = this.local.getItem(key) ?? this.session.getItem(key);
      const current = saved ? readString(parseJson(saved), 'joinId') || null : null;
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
      const saved = this.local.getItem(key) ?? this.session.getItem(key);
      joinId = saved ? readString(parseJson(saved), 'joinId') || undefined : undefined;
    } catch {
      /* session storage below remains a fallback */
    }
    this.writeGuestRecord(key, { joinId, displayName });
  }

  private writeGuestRecord(key: string, value: { joinId?: string; displayName?: string }): void {
    try {
      this.local.setItem(key, JSON.stringify(value));
    } catch {
      try {
        this.session.setItem(key, JSON.stringify(value));
      } catch {
        /* server still validates token and capacity */
      }
    }
  }

  private async guestStorageKey(inviteToken: string): Promise<string> {
    try {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(inviteToken));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `setpoint.shared.guest.${hash}`;
    } catch {
      return `setpoint.shared.guest.${inviteToken.slice(-16)}`;
    }
  }

  private requireClient(): AppSupabaseClient {
    return requireSupabaseClient(this.client);
  }
}
