import type { Provider } from '@angular/core';
import { ARCHIVE } from '../../ports/archive.port';
import { AUTH } from '../../ports/auth.port';
import { DASHBOARD } from '../../ports/dashboard.port';
import { TOURNAMENT_FEED } from '../../ports/live-feed.port';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../../ports/tournaments.port';
import { SupabaseArchive } from './supabase-archive';
import { SupabaseAuth } from './supabase-auth';
import { SupabaseDashboard } from './supabase-dashboard';
import { SupabaseFeed } from './supabase-feed';
import { SupabaseLocalLive } from './supabase-local-live';
import { SupabaseSharedTournaments } from './supabase-shared-tournaments';

/** Binds the auth, tournament, feed, archive and dashboard ports to Supabase. The only place that names this vendor for them. */
export function provideSupabaseAdapters(): Provider[] {
  return [
    { provide: AUTH, useExisting: SupabaseAuth },
    { provide: SHARED_TOURNAMENTS, useExisting: SupabaseSharedTournaments },
    { provide: LOCAL_LIVE, useExisting: SupabaseLocalLive },
    { provide: TOURNAMENT_FEED, useExisting: SupabaseFeed },
    { provide: ARCHIVE, useExisting: SupabaseArchive },
    { provide: DASHBOARD, useExisting: SupabaseDashboard },
  ];
}
