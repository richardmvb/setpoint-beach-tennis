import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../../testing/memory-storage';
import { DASHBOARD } from '../../ports/dashboard.port';
import { LOCAL_STORE, SESSION_STORE } from '../../ports/key-value-store.port';
import { dashboardContract } from '../../ports/testing/dashboard.contract';
import { localLiveContract } from '../../ports/testing/local-live.contract';
import { sharedTournamentsContract } from '../../ports/testing/shared-tournaments.contract';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../../ports/tournaments.port';
import { provideBrowserAdapters } from '../browser/provide-browser-adapters';
import { fakeSupabase } from './fake-supabase-client';
import { provideSupabaseAdapters } from './provide-supabase-adapters';
import { SUPABASE_CLIENT } from './supabase-client';

/** The Supabase adapters against the same contracts as the in-memory fakes, over a fake supabase-js client. */
function setup() {
  TestBed.resetTestingModule();
  const supabase = fakeSupabase();
  TestBed.configureTestingModule({
    providers: [
      provideBrowserAdapters(),
      provideSupabaseAdapters(),
      { provide: SUPABASE_CLIENT, useValue: supabase.client },
      { provide: LOCAL_STORE, useValue: new MemoryStorage() },
      { provide: SESSION_STORE, useValue: new MemoryStorage() },
    ],
  });
  const refuse = (rpcs: string[], code: string) => {
    for (const rpc of rpcs) supabase.reply(rpc, { error: { code: 'P0001', message: code } });
  };
  return { supabase, refuse };
}

sharedTournamentsContract('SupabaseSharedTournaments', () => {
  const { supabase, refuse } = setup();
  return {
    port: TestBed.inject(SHARED_TOURNAMENTS),
    given: (_token, snapshot) => {
      supabase.reply('get_shared_tournament', { data: snapshot });
      supabase.reply('join_shared_tournament', { data: snapshot });
    },
    fail: (code) => refuse(['get_shared_tournament', 'join_shared_tournament'], code),
  };
});

localLiveContract('SupabaseLocalLive', () => {
  const { supabase, refuse } = setup();
  return {
    port: TestBed.inject(LOCAL_LIVE),
    given: (_token, snapshot) => supabase.reply('get_local_live_tournament', { data: snapshot }),
    fail: (code) => refuse(['get_local_live_tournament'], code),
  };
});

dashboardContract('SupabaseDashboard', () => {
  const { supabase, refuse } = setup();
  return {
    port: TestBed.inject(DASHBOARD),
    given: (_source, tournament) => supabase.reply('get_dashboard_tournament', { data: tournament }),
    fail: (code) => refuse(['get_dashboard_tournament'], code),
  };
});
