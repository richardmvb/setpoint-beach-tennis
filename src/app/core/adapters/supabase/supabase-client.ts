import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * The Supabase client, built once from the runtime config, or null when the deploy has no Supabase settings.
 * Tests replace it with a fake.
 */
export const SUPABASE_CLIENT = new InjectionToken<AppSupabaseClient | null>('SupabaseClient', {
  providedIn: 'root',
  factory: () => {
    const config = window.__SETPOINT_CONFIG__;
    const supabaseUrl = config?.supabaseUrl?.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const publishableKey = config?.publishableKey;
    if (!supabaseUrl || !publishableKey) return null;
    return createClient<Database>(supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  },
});

export function requireSupabaseClient(client: AppSupabaseClient | null): AppSupabaseClient {
  if (!client) throw new Error('O modo compartilhado ainda não está configurado neste deploy.');
  return client;
}
