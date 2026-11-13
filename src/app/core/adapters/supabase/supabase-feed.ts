import { inject, Injectable } from '@angular/core';
import { REALTIME_SUBSCRIBE_STATES, RealtimeChannel } from '@supabase/supabase-js';
import type { TournamentFeed } from '../../ports/live-feed.port';
import { AppSupabaseClient, requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

/** Realtime broadcast channels, one per watched tournament. The repositories use it to tell watchers about their writes. */
@Injectable({ providedIn: 'root' })
export class SupabaseFeed implements TournamentFeed {
  private readonly client: AppSupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly channels = new Map<string, RealtimeChannel>();

  watchLocal(id: string, onChange: () => void): () => void {
    const client = this.requireClient();
    const key = `local-live:${id}`;
    const previous = this.channels.get(key);
    if (previous) void client.removeChannel(previous);
    const channel = client.channel(key).on('broadcast', { event: 'refresh' }, onChange).subscribe();
    this.channels.set(key, channel);
    return () => {
      if (this.channels.get(key) !== channel) return;
      this.channels.delete(key);
      void client.removeChannel(channel);
    };
  }

  /** Adapter-internal: tells viewers a local tournament changed. */
  async notifyLocal(id: string): Promise<void> {
    const key = `local-live:${id}`;
    const subscribed = this.channels.get(key);
    if (subscribed) {
      await subscribed.send({ type: 'broadcast', event: 'refresh', payload: {} });
      return;
    }
    const client = this.requireClient();
    const channel = client.channel(key);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void client.removeChannel(channel);
        reject(new Error('Live update timeout.'));
      }, 5000);
      channel.subscribe(
        (status) =>
          void (async () => {
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              const result = await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
              clearTimeout(timeout);
              await client.removeChannel(channel);
              if (result === 'ok') resolve();
              else reject(new Error('Live update failed.'));
            } else if (
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
              status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
            ) {
              clearTimeout(timeout);
              await client.removeChannel(channel);
              reject(new Error('Live channel unavailable.'));
            }
          })(),
      );
    });
  }

  watchShared(id: string, onChange: () => void): () => void {
    const client = this.requireClient();
    this.stopSharedWatch(id);
    const channel = client
      .channel(`shared-tournament:${id}`)
      .on('broadcast', { event: 'refresh' }, onChange)
      .subscribe();
    this.channels.set(id, channel);
    return () => {
      if (this.channels.get(id) === channel) this.stopSharedWatch(id);
    };
  }

  stopSharedWatch(id: string): void {
    const channel = this.channels.get(id);
    if (!channel || !this.client) return;
    this.channels.delete(id);
    void this.client.removeChannel(channel);
  }

  /** Adapter-internal: tells watchers a shared tournament changed, over the open channel or a short-lived one. */
  async broadcastShared(id: string): Promise<void> {
    const subscribed = this.channels.get(id);
    if (subscribed) {
      if ((await subscribed.send({ type: 'broadcast', event: 'refresh', payload: {} })) !== 'ok') {
        throw new Error('Não foi possível notificar os espectadores.');
      }
      return;
    }
    const client = this.requireClient();
    const channel = client.channel(`shared-tournament:${id}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void client.removeChannel(channel);
        reject(new Error('Tempo esgotado ao notificar os espectadores.'));
      }, 5000);
      channel.subscribe(
        (status) =>
          void (async () => {
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              const result = await channel.send({ type: 'broadcast', event: 'refresh', payload: {} });
              clearTimeout(timeout);
              await client.removeChannel(channel);
              if (result === 'ok') resolve();
              else reject(new Error('Não foi possível notificar os espectadores.'));
            } else if (
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
              status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
            ) {
              clearTimeout(timeout);
              await client.removeChannel(channel);
              reject(new Error('Não foi possível conectar ao canal de atualizações.'));
            }
          })(),
      );
    });
  }

  private requireClient(): AppSupabaseClient {
    return requireSupabaseClient(this.client);
  }
}
