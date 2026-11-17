import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentTournament } from '../core/current-tournament';
import type { SharedTournamentSnapshot, TournamentState } from '../core/models';
import { Notices } from '../core/notices';
import { OwnedSharedTournament } from '../core/owned-shared-tournament';
import { APP_CONFIG } from '../core/ports/app-config.port';
import { testConfig } from '../core/ports/testing/app-config.fake';
import { AppNavigation } from '../core/routing/app-navigation';
import { SavedTournaments } from '../core/saved-tournaments';
import { SetupProgress } from '../core/setup-progress';
import { TournamentSync } from '../core/sync/tournament-sync';
import { shellFakes } from '../testing/shell-fakes';
import { storedTournament } from '../testing/tournament-state';
import { ShellStartup } from './shell-startup';

const running = (): TournamentState => ({ ...storedTournament(), hostingMode: 'local', analyticsId: 'a1' });
const STATE_KEY = 'setpoint.tournament.v1';
const BUILD_KEY = 'setpoint.build.v1';
const LIVE = JSON.stringify({ id: 'live-1', readToken: 'read-1', writeToken: 'write-1' });

function setup(options: Parameters<typeof shellFakes>[0] = {}, buildId = 'test') {
  const fakes = shellFakes(options);
  TestBed.configureTestingModule({
    providers: [...fakes.providers, { provide: APP_CONFIG, useValue: testConfig({ buildId }) }],
  });
  return {
    ...fakes,
    startup: TestBed.inject(ShellStartup),
    tournament: TestBed.inject(CurrentTournament),
    navigation: TestBed.inject(AppNavigation),
    notices: TestBed.inject(Notices),
    sync: TestBed.inject(TournamentSync),
    saved: TestBed.inject(SavedTournaments),
    owned: TestBed.inject(OwnedSharedTournament),
  };
}

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('restoring what the device holds', () => {
  it('starts a new tournament on the setup page when nothing is stored', () => {
    const { startup, tournament, navigation, notices } = setup();
    startup.restore();
    expect(tournament.state().rounds).toEqual([]);
    expect(navigation.page()).toBe('setup');
    expect(notices.notice()).toBeNull();
  });

  it('opens a stored tournament with a schedule on the overview, and keeps it in "Meus torneios"', () => {
    const { startup, tournament, navigation, local, saved } = setup();
    local.setItem(STATE_KEY, JSON.stringify(running()));
    startup.restore();
    expect(tournament.state().analyticsId).toBe('a1');
    expect(navigation.page()).toBe('overview');
    expect(saved.entries().map((entry) => entry.id)).toEqual(['a1']);
  });

  it('fills what an older version did not store, and fits courts to a setup without a schedule', () => {
    const { startup, tournament, local } = setup();
    const old = { ...running(), rounds: [], groupFormat: undefined, tieBreakDraws: undefined, courts: 5 };
    local.setItem(STATE_KEY, JSON.stringify(old));
    startup.restore();
    expect(tournament.state()).toMatchObject({ groupFormat: 'rotating', tieBreakDraws: [], courts: 2 });
  });

  it('puts back what was still waiting to be sent, and the moderator of a started shared tournament', () => {
    const { startup, tournament, local, owned } = setup();
    const base: TournamentState = {
      ...storedTournament(),
      hostingMode: 'shared',
      sharedTournamentId: 's1',
      sharedStatus: 'active',
    };
    const pending = { ...base, name: 'Pendente' };
    local.setItem(STATE_KEY, JSON.stringify(base));
    local.setItem('setpoint.sync.shared.s1', JSON.stringify({ version: 1, base, pending, revision: 1 }));
    startup.restore();
    expect(tournament.state().name).toBe('Pendente');
    expect(owned.moderator()).toBe(true);
  });

  it('starts the queue for a stored live link', () => {
    const { startup, local, sync } = setup();
    local.setItem(STATE_KEY, JSON.stringify(running()));
    local.setItem('setpoint.local.live.a1', LIVE);
    startup.restore();
    expect(sync.available()).toBe(true);
    expect(local.getItem('setpoint.sync.local.a1')).not.toBeNull();
  });

  it('opens the dashboard route on the dashboard, without keeping anything in the library', () => {
    const { startup, navigation, local, saved } = setup({ dashboard: true });
    local.setItem(STATE_KEY, JSON.stringify(running()));
    startup.restore();
    expect(navigation.page()).toBe('dashboard');
    expect(saved.library.list()).toEqual([]);
  });

  it("shows someone else's tournament as a placeholder that only carries its hosting mode", () => {
    const { startup, tournament, navigation, local } = setup({ sharedView: true });
    local.setItem(STATE_KEY, JSON.stringify(running()));
    startup.restore();
    expect(navigation.page()).toBe('shared');
    expect(tournament.state()).toMatchObject({ hostingMode: 'local', rounds: [] });
  });
});

describe('a new version of the app', () => {
  const finalMatch = (id: string, finalKind: string) => ({
    id,
    finalKind,
    court: 1,
    teamA: ['p1', 'p2'],
    teamB: ['p3', 'p4'],
    scoreA: 6,
    scoreB: 4,
  });
  const finished = (): TournamentState => ({
    ...running(),
    finishedAt: '2026-11-13T12:00:00.000Z',
    finals: {
      complete: true,
      podiumPlayerIds: [],
      matches: [finalMatch('f1', 'semifinal'), finalMatch('f2', 'championship')],
    } as never,
  });

  it('starts over after a finished tournament and says it stays saved in "Meus torneios"', () => {
    const { startup, tournament, notices, local, saved } = setup({}, 'build-2');
    local.setItem(BUILD_KEY, 'build-1');
    local.setItem(STATE_KEY, JSON.stringify(finished()));
    startup.restore();
    expect(tournament.state().rounds).toEqual([]);
    expect(notices.notice()).toMatchObject({ tone: 'success', key: 'versionReset' });
    expect(saved.entries().map((entry) => entry.id)).toEqual(['a1']);
    expect(local.getItem(STATE_KEY)).toBeNull();
  });

  it('keeps a tournament that is still being played, and one with changes not sent yet', () => {
    const { startup, tournament, notices, local } = setup({}, 'build-2');
    local.setItem(BUILD_KEY, 'build-1');
    local.setItem(STATE_KEY, JSON.stringify(running()));
    startup.restore();
    expect(tournament.state().analyticsId).toBe('a1');
    expect(notices.notice()).toBeNull();
  });

  it('keeps a finished tournament whose queue still holds changes', () => {
    const { startup, tournament, local } = setup({}, 'build-2');
    local.setItem(BUILD_KEY, 'build-1');
    local.setItem(STATE_KEY, JSON.stringify(finished()));
    local.setItem('setpoint.local.live.a1', LIVE);
    local.setItem(
      'setpoint.sync.local.a1',
      JSON.stringify({ version: 1, base: finished(), pending: { ...finished(), name: 'Pendente' }, revision: 1 }),
    );
    startup.restore();
    expect(tournament.state().name).toBe('Pendente');
  });
});

describe('starting the background work', () => {
  it('starts nothing in a shared view', () => {
    const { startup, auth, connectivity } = setup({ sharedView: true });
    startup.start(false);
    // Only the sync's own listener: the shell's reconnect run is not started.
    expect(connectivity.listening()).toBe(1);
    expect(auth.configured).toBe(true);
  });

  it('archives and reports what the device holds unless the lock screen is up', async () => {
    const { startup, local, archive } = setup();
    local.setItem(STATE_KEY, JSON.stringify(running()));
    startup.restore();
    startup.start(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(archive.recordLocalTournamentMetrics).toHaveBeenCalledOnce();
    expect(archive.saveLocalTournamentArchive).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    const locked = setup();
    locked.local.setItem(STATE_KEY, JSON.stringify(running()));
    locked.startup.restore();
    locked.startup.start(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(locked.archive.saveLocalTournamentArchive).not.toHaveBeenCalled();
    locked.startup.afterUnlock();
    await vi.advanceTimersByTimeAsync(0);
    expect(locked.archive.saveLocalTournamentArchive).toHaveBeenCalledOnce();
  });

  it('sends what is pending and uploads again when the connection comes back, until stopped', async () => {
    const { startup, local, connectivity, archive, localLive } = setup({ online: false });
    local.setItem(STATE_KEY, JSON.stringify(running()));
    local.setItem('setpoint.local.live.a1', LIVE);
    startup.restore();
    startup.start(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(archive.saveLocalTournamentArchive).not.toHaveBeenCalled();
    localLive.syncLocalLiveTournament.mockImplementation((_t: string, _b: unknown, next: unknown) =>
      Promise.resolve({ id: 'live-1', status: 'active', state: next }),
    );
    connectivity.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(archive.saveLocalTournamentArchive).toHaveBeenCalledOnce();
    startup.stop();
    expect(connectivity.listening()).toBe(1);
  });

  it("restores the moderator's own shared tournament and puts them on step 2 when it has no schedule yet", async () => {
    const { startup, local, session, auth, shared, navigation, owned } = setup();
    const draft: TournamentState = {
      ...storedTournament(),
      hostingMode: 'shared',
      sharedTournamentId: 's1',
      sharedStatus: 'registration',
      rounds: [],
    };
    local.setItem(STATE_KEY, JSON.stringify(draft));
    local.setItem('setpoint.shared.setup', 'old');
    session.setItem('setpoint.shared.setup', 'old');
    await auth.signInAnonymously();
    shared.getOwnedSharedTournament.mockResolvedValue({
      id: 's1',
      status: 'registration',
      capacity: 8,
      state: draft,
      inviteToken: 'inv',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
    } satisfies SharedTournamentSnapshot);
    startup.restore();
    startup.start(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(local.getItem('setpoint.shared.setup')).toBeNull();
    expect(session.getItem('setpoint.shared.setup')).toBeNull();
    expect(owned.moderator()).toBe(true);
    expect(navigation.page()).toBe('setup');
    expect(TestBed.inject(SetupProgress).step()).toBe(2);
    startup.stop();
  });

  it('does not restore a shared tournament without a backend', async () => {
    const { startup, local, shared } = setup({ configured: false });
    local.setItem(
      STATE_KEY,
      JSON.stringify({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's1' }),
    );
    startup.restore();
    startup.start(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(shared.getOwnedSharedTournament).not.toHaveBeenCalled();
    startup.stop();
  });
});

describe('when a shared tournament is applied', () => {
  it('moves to the right page, unless only the data changed', () => {
    const { owned, navigation, tournament } = setup();
    expect(TestBed.inject(ShellStartup)).toBeTruthy();
    const snapshot = (state: TournamentState): SharedTournamentSnapshot => ({
      id: 's1',
      status: 'registration',
      capacity: 8,
      state,
      inviteToken: '',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
    });
    navigation.initialize('settings');
    owned.apply(snapshot({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's1' }), true);
    expect(navigation.page()).toBe('settings');
    owned.apply(snapshot({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's1' }));
    expect(navigation.page()).toBe('overview');
    owned.apply(snapshot({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's1', rounds: [] }));
    expect(navigation.page()).toBe('setup');
    expect(tournament.state().rounds).toEqual([]);
  });
});
