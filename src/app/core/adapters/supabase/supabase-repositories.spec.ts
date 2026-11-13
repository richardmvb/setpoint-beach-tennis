import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TournamentState } from '../../models';
import { ARCHIVE } from '../../ports/archive.port';
import { DASHBOARD } from '../../ports/dashboard.port';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../../ports/tournaments.port';
import { fakeSupabase } from './fake-supabase-client';
import { provideSupabaseAdapters } from './provide-supabase-adapters';
import { SUPABASE_CLIENT } from './supabase-client';

const STATE = {
  version: 1,
  name: 'Torneio',
  size: 8,
  courts: 2,
  gamesToWin: 4,
  roundCount: 7,
  players: [{ id: 'p1', name: 'Ana', photoDataUrl: 'data:image/png;base64,AAAA' }],
  rounds: [],
  createdAt: '2026-11-13T10:00:00.000Z',
  tournamentMode: 'super',
  groupFormat: 'rotating',
  groups: [],
  fixedPairs: [],
  finals: null,
  analyticsId: 'analytics-1',
  startedAt: '2026-11-13T10:00:00.000Z',
} as unknown as TournamentState;

const SHARED = {
  id: 's1',
  status: 'registration',
  capacity: 8,
  state: STATE,
  inviteExpiresAt: '2099-01-01T00:00:00Z',
  expiresAt: null,
};
const LOCAL = { id: 'l1', status: 'active', state: STATE };

function setup(options: { signedIn?: boolean; client?: null } = {}) {
  TestBed.resetTestingModule();
  const supabase = fakeSupabase({ signedIn: options.signedIn });
  TestBed.configureTestingModule({
    providers: [
      provideSupabaseAdapters(),
      { provide: SUPABASE_CLIENT, useValue: options.client === null ? null : supabase.client },
    ],
  });
  return {
    supabase,
    shared: TestBed.inject(SHARED_TOURNAMENTS),
    local: TestBed.inject(LOCAL_LIVE),
    archive: TestBed.inject(ARCHIVE),
    dashboard: TestBed.inject(DASHBOARD),
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('SupabaseSharedTournaments', () => {
  it('maps every operation to its RPC and parameters', async () => {
    const { supabase, shared } = setup();
    for (const name of [
      'create_shared_tournament',
      'join_shared_tournament',
      'get_shared_tournament',
      'get_owned_shared_tournament',
      'add_shared_participant',
      'remove_shared_participant',
      'start_shared_tournament',
      'save_shared_tournament',
      'sync_shared_tournament',
    ])
      supabase.reply(name, { data: SHARED });
    supabase.reply('rotate_shared_invite', { data: { inviteToken: 'new', inviteExpiresAt: '2099-01-01T00:00:00Z' } });

    await shared.createSharedTournament(STATE, 'Moderadora', 'female', 'photo');
    await shared.getSharedTournament('tok');
    await shared.getOwnedSharedTournament('s1');
    await shared.addSharedParticipant('s1', 'Bia', 'female', 'img');
    await shared.removeSharedParticipant('s1', 'p1');
    await shared.startSharedTournament('s1', STATE);
    await shared.saveSharedTournament('s1', STATE);
    await shared.syncSharedTournament('s1', STATE, STATE);
    await shared.cancelSharedTournament('s1');
    expect(await shared.rotateSharedInvite('s1')).toEqual({
      inviteToken: 'new',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
    });

    expect(supabase.calls('create_shared_tournament')[0]).toMatchObject({
      p_name: 'Torneio',
      p_capacity: 8,
      p_moderator_name: 'Moderadora',
      p_moderator_gender: 'female',
      p_initial_state: { moderatorAvatarDataUrl: 'photo' },
    });
    expect(supabase.calls('get_shared_tournament')[0]).toEqual({ p_invite_token: 'tok' });
    expect(supabase.calls('get_owned_shared_tournament')[0]).toEqual({ p_tournament_id: 's1' });
    expect(supabase.calls('add_shared_participant')[0]).toEqual({
      p_tournament_id: 's1',
      p_display_name: 'Bia',
      p_gender: 'female',
      p_avatar_data: 'img',
    });
    expect(supabase.calls('remove_shared_participant')[0]).toEqual({ p_tournament_id: 's1', p_player_id: 'p1' });
    expect(supabase.calls('start_shared_tournament')[0]).toMatchObject({ p_tournament_id: 's1' });
    expect(supabase.calls('save_shared_tournament')[0]).toMatchObject({ p_tournament_id: 's1' });
    expect(supabase.calls('sync_shared_tournament')[0]).toMatchObject({ p_tournament_id: 's1' });
    expect(supabase.calls('cancel_shared_tournament')[0]).toEqual({ p_tournament_id: 's1' });
    expect(supabase.calls('rotate_shared_invite')[0]).toEqual({ p_tournament_id: 's1' });
  });

  it('rethrows the backend error object unchanged, so its message reaches the user', async () => {
    const { supabase, shared } = setup();
    supabase.reply('get_shared_tournament', { error: { code: 'P0001', message: 'invite_expired' } });
    await expect(shared.getSharedTournament('tok')).rejects.toEqual({ code: 'P0001', message: 'invite_expired' });
  });

  it('rejects a response that is not a tournament snapshot', async () => {
    const { supabase, shared } = setup();
    supabase.reply('get_shared_tournament', { data: { id: 7 } });
    await expect(shared.getSharedTournament('tok')).rejects.toThrow();
  });

  it('tells watchers about a write through the tournament channel', async () => {
    const { supabase, shared } = setup();
    supabase.reply('save_shared_tournament', { data: SHARED });
    await shared.saveSharedTournament('s1', STATE);
    expect(supabase.removed).toContain('shared-tournament:s1');
  });

  it('remembers the name and the join id of this device for an invite', async () => {
    const { supabase, shared } = setup();
    supabase.reply('join_shared_tournament', { data: SHARED });
    expect(await shared.getGuestName('tok')).toBe('');

    await shared.joinSharedTournament('tok', 'Carla');
    await shared.joinSharedTournament('tok', 'Carla');

    expect(await shared.getGuestName('tok')).toBe('Carla');
    const [first, second] = supabase.calls('join_shared_tournament') as { p_join_id: string }[];
    expect(first?.p_join_id).toBeTruthy();
    expect(second?.p_join_id).toBe(first?.p_join_id);
    expect(await shared.getGuestName('other-token')).toBe('');
  });

  it('says cloud features are not configured when the deploy has no Supabase settings', async () => {
    const { shared } = setup({ client: null });
    await expect(shared.getSharedTournament('tok')).rejects.toThrow('não está configurado');
  });
});

describe('SupabaseLocalLive', () => {
  it('signs in anonymously first when nobody is signed in, and publishes without photos or analytics id', async () => {
    const { supabase, local } = setup();
    supabase.reply('create_local_live_tournament', { data: { id: 'l1', readToken: 'r', writeToken: 'w' } });

    expect(await local.createLocalLiveTournament(STATE)).toEqual({ id: 'l1', readToken: 'r', writeToken: 'w' });

    expect(supabase.auth.signInCalls).toBe(1);
    const [params] = supabase.calls('create_local_live_tournament') as { p_state: TournamentState }[];
    expect(params?.p_state.analyticsId).toBeUndefined();
    expect(params?.p_state.players[0]).not.toHaveProperty('photoDataUrl');
  });

  it('does not sign in again when already signed in', async () => {
    const { supabase, local } = setup({ signedIn: true });
    supabase.reply('create_local_live_tournament', { data: { id: 'l1', readToken: 'r', writeToken: 'w' } });
    await local.createLocalLiveTournament(STATE);
    expect(supabase.auth.signInCalls).toBe(0);
  });

  it('reads with the read token and writes with the write token', async () => {
    const { supabase, local } = setup();
    supabase.reply('get_local_live_tournament', { data: LOCAL });
    supabase.reply('update_local_live_tournament', { data: LOCAL });
    supabase.reply('sync_local_live_tournament', { data: LOCAL });

    await local.getLocalLiveTournament('read-token');
    await local.updateLocalLiveTournament('write-token', STATE);
    await local.syncLocalLiveTournament('write-token', STATE, STATE);

    expect(supabase.calls('get_local_live_tournament')[0]).toEqual({ p_read_token: 'read-token' });
    expect(supabase.calls('update_local_live_tournament')[0]).toMatchObject({ p_write_token: 'write-token' });
    expect(supabase.calls('sync_local_live_tournament')[0]).toMatchObject({
      p_write_token: 'write-token',
      p_base_state: { name: 'Torneio' },
    });
  });

  it('rethrows backend errors unchanged', async () => {
    const { supabase, local } = setup();
    supabase.reply('get_local_live_tournament', { error: { message: 'invalid_live_link' } });
    await expect(local.getLocalLiveTournament('x')).rejects.toEqual({ message: 'invalid_live_link' });
  });
});

describe('SupabaseArchive', () => {
  it('records metrics for a started local tournament, signing in first if needed', async () => {
    const { supabase, archive } = setup();
    await archive.recordLocalTournamentMetrics(STATE, true);
    expect(supabase.auth.signInCalls).toBe(1);
    expect(supabase.calls('record_local_tournament_metrics')[0]).toMatchObject({
      p_tournament_id: 'analytics-1',
      p_tournament_size: 8,
      p_participant_count: 1,
      p_abandoned: true,
    });
  });

  it('records nothing for a shared tournament or one that has not started', async () => {
    const { supabase, archive } = setup();
    await archive.recordLocalTournamentMetrics({ ...STATE, hostingMode: 'shared' });
    await archive.recordLocalTournamentMetrics({ ...STATE, startedAt: undefined });
    await archive.recordLocalTournamentMetrics({ ...STATE, analyticsId: undefined });
    expect(supabase.rpcCalls).toEqual([]);
  });

  it('uploads the archive without photos, linked to the live tournament', async () => {
    const { supabase, archive } = setup({ signedIn: true });
    await archive.saveLocalTournamentArchive('analytics-1', STATE, 'l1');
    const [params] = supabase.calls('save_local_tournament_archive') as {
      p_tournament_id: string;
      p_live_tournament_id: string;
      p_state: TournamentState;
    }[];
    expect(params?.p_tournament_id).toBe('analytics-1');
    expect(params?.p_live_tournament_id).toBe('l1');
    expect(params?.p_state.players[0]).not.toHaveProperty('photoDataUrl');
  });
});

describe('SupabaseDashboard', () => {
  const activity = (active: object[]) => ({
    active_tournaments: active,
    archived_tournaments: [],
    abandoned_registration: 0,
    abandoned_no_scores: 0,
    abandoned_under_half: 0,
    abandoned_over_half: 0,
    abandoned_rounds_complete: 0,
    abandoned_finals: 0,
    abandoned_unknown: 0,
  });
  const item = (id: string, source: 'shared' | 'local', extra: object = {}) => ({
    id,
    source,
    name: id,
    size: 8,
    mode: 'super',
    updated_at: new Date().toISOString(),
    matches_completed: 0,
    matches_total: 28,
    ...extra,
  });

  it('reads the metrics', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_metrics', { data: { tournaments_total: 3, participants_total: 20 } });
    expect(await dashboard.getDashboardMetrics()).toMatchObject({ tournaments_total: 3 });
  });

  it('returns null insights when the backend does not have them yet, and rethrows other errors', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_insights', { error: { code: 'PGRST202', message: 'missing' } });
    expect(await dashboard.getDashboardInsights(30)).toBeNull();
    supabase.reply('get_dashboard_insights', { error: { code: '42501', message: 'denied' } });
    await expect(dashboard.getDashboardInsights(30)).rejects.toEqual({ code: '42501', message: 'denied' });
  });

  it('lists a live tournament once: the archive replaces the live entry', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_activity', { data: activity([item('l9', 'local'), item('s1', 'shared')]) });
    supabase.reply('get_dashboard_archived_local_tournaments', { data: [] });
    supabase.reply('get_dashboard_local_archives', {
      data: [item('a1', 'local', { live_id: 'l9', status: 'active' })],
    });

    const result = await dashboard.getDashboardActivity();

    expect(result.active_tournaments.map((entry) => entry.id).sort()).toEqual(['a1', 's1']);
    expect(result.local_archives_available).toBe(true);
  });

  it('keeps working when the local archive RPCs do not exist yet', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_activity', { data: activity([item('s1', 'shared')]) });
    supabase.reply('get_dashboard_archived_local_tournaments', { error: { code: 'PGRST202', message: 'missing' } });
    supabase.reply('get_dashboard_local_archives', { error: { code: 'PGRST202', message: 'missing' } });

    const result = await dashboard.getDashboardActivity();

    expect(result.active_tournaments.map((entry) => entry.id)).toEqual(['s1']);
    expect(result.local_archives_available).toBe(false);
  });

  it('shows each tournament once: the full archive replaces the live link', async () => {
    const { supabase, dashboard } = setup();
    const recent = new Date().toISOString();
    const old = '2026-01-01T00:00:00Z';
    supabase.reply('get_dashboard_activity', {
      data: {
        active_tournaments: [
          { id: 'live', source: 'local', updated_at: recent },
          { id: 'shared', source: 'shared', updated_at: recent },
        ],
        archived_tournaments: [],
      },
    });
    supabase.reply('get_dashboard_archived_local_tournaments', {
      data: [{ id: 'live-archived', source: 'local', updated_at: old }],
    });
    supabase.reply('get_dashboard_local_archives', {
      data: [
        { id: 'archive-live', live_id: 'live', source: 'local', status: 'active', updated_at: recent },
        { id: 'archive-done', live_id: 'live-archived', source: 'local', status: 'completed', updated_at: old },
        { id: 'archive-stale', live_id: null, source: 'local', status: 'active', updated_at: old },
      ],
    });

    const merged = await dashboard.getDashboardActivity();

    expect(merged.active_tournaments.map((entry) => entry.id).sort()).toEqual(['archive-live', 'shared']);
    expect(merged.archived_tournaments.map((entry) => entry.id).sort()).toEqual(['archive-done', 'archive-stale']);
  });

  it('merges local archives, and stays compatible before the migration is applied', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_activity', {
      data: { active_tournaments: [], archived_tournaments: [{ id: 'shared', updated_at: '2026-11-07T10:00:00Z' }] },
    });
    supabase.reply('get_dashboard_local_archives', { data: [] });
    supabase.reply('get_dashboard_archived_local_tournaments', {
      data: [{ id: 'local', updated_at: '2026-11-08T10:00:00Z' }],
    });

    const merged = await dashboard.getDashboardActivity();
    expect(merged.archived_tournaments.map((entry) => entry.id)).toEqual(['local', 'shared']);
    expect(merged.local_archives_available).toBe(true);

    supabase.reply('get_dashboard_archived_local_tournaments', { error: { code: 'PGRST202', message: 'missing' } });
    const legacy = await dashboard.getDashboardActivity();
    expect(legacy.archived_tournaments.map((entry) => entry.id)).toEqual(['shared']);
    expect(legacy.local_archives_available).toBe(false);
  });

  it('reads one tournament for the viewer', async () => {
    const { supabase, dashboard } = setup();
    supabase.reply('get_dashboard_tournament', { data: { id: 's1', status: 'active', state: STATE } });
    await dashboard.getDashboardTournament('shared', 's1');
    expect(supabase.calls('get_dashboard_tournament')[0]).toEqual({ p_source: 'shared', p_tournament_id: 's1' });
  });
});
