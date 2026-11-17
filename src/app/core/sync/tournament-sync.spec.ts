import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellFakes } from '../../testing/shell-fakes';
import { namedPlayers, storedTournament, tournamentState } from '../../testing/tournament-state';
import { CurrentTournament } from '../current-tournament';
import { LocalLiveLink } from '../local-live-link';
import type { SharedTournamentSnapshot, TournamentState } from '../models';
import { OwnedSharedTournament } from '../owned-shared-tournament';
import { TournamentSync } from './tournament-sync';

const LIVE = JSON.stringify({ id: 'live-1', readToken: 'read-1', writeToken: 'write-1' });

/** A running local tournament with a live link: the case where scores go through the sync queue. */
function localRunning(overrides: Partial<TournamentState> = {}): TournamentState {
  return { ...storedTournament(), hostingMode: 'local', analyticsId: 'a1', ...overrides };
}

function setup(options: Parameters<typeof shellFakes>[0] = {}, state: TournamentState = localRunning()) {
  const fakes = shellFakes(options);
  TestBed.configureTestingModule({ providers: fakes.providers });
  fakes.local.setItem('setpoint.local.live.a1', LIVE);
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(state);
  const link = TestBed.inject(LocalLiveLink);
  const sync = TestBed.inject(TournamentSync);
  link.restore(state);
  sync.initialize('local', 'a1', state);
  const snapshot = (next: TournamentState) => ({ id: 'live-1', status: 'active', state: next });
  fakes.localLive.syncLocalLiveTournament.mockImplementation((_token: string, _base: unknown, next: unknown) =>
    Promise.resolve(snapshot(next as TournamentState)),
  );
  return { ...fakes, tournament, link, sync, owned: TestBed.inject(OwnedSharedTournament) };
}

const scored = (state: TournamentState): TournamentState => ({ ...state, name: `${state.name} +` });

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('what is available to sync', () => {
  it('is device-only without a live link, and synced with one', () => {
    const fakes = shellFakes();
    TestBed.configureTestingModule({ providers: fakes.providers });
    TestBed.inject(CurrentTournament).set(localRunning());
    const sync = TestBed.inject(TournamentSync);
    expect(sync.available()).toBe(false);
    expect(sync.status()).toBe('device-only');
    expect(sync.target()).toEqual({ kind: 'local', id: 'a1' });

    TestBed.resetTestingModule();
    const { sync: linked } = setup();
    expect(linked.available()).toBe(true);
    expect(linked.status()).toBe('synced');
  });

  it('syncs a shared tournament only for its moderator, once it has a schedule', () => {
    const shared = storedTournament();
    const { sync, tournament, owned } = setup({}, { ...shared, hostingMode: 'shared', sharedTournamentId: 's1' });
    expect(sync.target()).toEqual({ kind: 'shared', id: 's1' });
    expect(sync.available()).toBe(false);
    owned.setModerator(true);
    expect(sync.available()).toBe(true);
    tournament.update((state) => ({ ...state, rounds: [] }));
    expect(sync.available()).toBe(false);
  });

  it('has nothing to sync on the dashboard or in a shared view', () => {
    expect(setup({ dashboard: true }).sync.target()).toBeNull();
    TestBed.resetTestingModule();
    expect(setup({ sharedView: true }).sync.target()).toBeNull();
  });
});

describe('sending changes', () => {
  it('queues a save, sends it after a short pause and clears the queue', async () => {
    const { sync, tournament, localLive } = setup();
    const next = scored(tournament.state());
    tournament.set(next);
    expect(sync.stage(next)).toBe(true);
    expect(sync.hasPending()).toBe(true);
    expect(sync.status()).toBe('pending');
    expect(localLive.syncLocalLiveTournament).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledOnce();
    const [token, , sent] = localLive.syncLocalLiveTournament.mock.calls[0] as unknown as [
      string,
      unknown,
      TournamentState,
    ];
    expect(token).toBe('write-1');
    expect(sent.name).toBe(next.name);
    expect(sync.hasPending()).toBe(false);
    expect(sync.status()).toBe('synced');
    expect(sync.error()).toBeNull();
  });

  it('does not queue when there is nothing to sync to', () => {
    const fakes = shellFakes();
    TestBed.configureTestingModule({ providers: fakes.providers });
    TestBed.inject(CurrentTournament).set(localRunning());
    const sync = TestBed.inject(TournamentSync);
    expect(sync.stage(localRunning())).toBe(false);
  });

  it('says so when the queue was never started for the tournament', () => {
    const fakes = shellFakes();
    TestBed.configureTestingModule({ providers: fakes.providers });
    fakes.local.setItem('setpoint.local.live.a1', LIVE);
    const tournament = TestBed.inject(CurrentTournament);
    tournament.set(localRunning());
    TestBed.inject(LocalLiveLink).restore(tournament.state());
    const sync = TestBed.inject(TournamentSync);
    expect(sync.stage(tournament.state())).toBe(false);
    expect(sync.error()).toBe('notStaged');
    expect(sync.status()).toBe('error');
  });

  it('keeps the error and the queue when the browser storage is full', () => {
    const { sync, tournament, local } = setup();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(sync.stage(scored(tournament.state()))).toBe(false);
    expect(sync.error()).toBe('queueNotSaved');
  });

  it('shows what the server said for a shared tournament and keeps the status it reports', async () => {
    const base = {
      ...storedTournament(),
      hostingMode: 'shared' as const,
      sharedTournamentId: 's1',
      sharedStatus: 'active' as const,
    };
    const { sync, tournament, owned, shared, local } = setup({}, base);
    owned.setModerator(true);
    sync.initialize('shared', 's1', base);
    const snapshot: SharedTournamentSnapshot = {
      id: 's1',
      status: 'completed',
      capacity: 8,
      state: scored(base),
      inviteToken: '',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
    };
    shared.syncSharedTournament.mockResolvedValue(snapshot);
    owned.replaceSnapshot({ ...snapshot, status: 'active' });
    const next = scored(base);
    tournament.set(next);
    expect(sync.stage(next)).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(shared.syncSharedTournament).toHaveBeenCalledWith('s1', base, next);
    expect(tournament.state().sharedStatus).toBe('completed');
    expect(owned.snapshot()?.status).toBe('completed');
    expect(JSON.parse(local.getItem('setpoint.tournament.v1') ?? '{}')).toMatchObject({ sharedStatus: 'completed' });
  });

  it('does not queue a shared tournament that has not started', () => {
    const base = {
      ...storedTournament(),
      hostingMode: 'shared' as const,
      sharedTournamentId: 's1',
      sharedStatus: 'ready' as const,
    };
    const { sync, owned } = setup({}, base);
    owned.setModerator(true);
    sync.initialize('shared', 's1', base);
    expect(sync.stage(base)).toBe(false);
  });
});

describe('errors', () => {
  it.each([
    ['sync_conflict', 'conflict'],
    ['tournament_expired', 'expired'],
    ['tournament_completed', 'expired'],
    ['tournament_archived', 'expired'],
    ['boom', 'failed'],
  ] as const)('maps %s to %s', async (message, key) => {
    const { sync, tournament, localLive } = setup();
    localLive.syncLocalLiveTournament.mockRejectedValue(new Error(message));
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    expect(sync.error()).toBe(key);
    expect(sync.status()).toBe('error');
    expect(sync.hasPending()).toBe(true);
  });

  it('retries from the poll only after the pause, and clears the error when it works', async () => {
    const { sync, tournament, localLive, clock } = setup();
    sync.start();
    localLive.syncLocalLiveTournament.mockRejectedValueOnce(new Error('boom'));
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledTimes(1);
    clock.advance(15000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledTimes(2);
    expect(sync.error()).toBeNull();
    expect(sync.hasPending()).toBe(false);
    sync.stop();
  });

  it('can be cleared', async () => {
    const { sync, tournament, localLive } = setup();
    localLive.syncLocalLiveTournament.mockRejectedValue(new Error('boom'));
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    sync.clearError();
    expect(sync.error()).toBeNull();
  });
});

describe('pause and connection', () => {
  it('keeps what is pending while paused, remembers the choice and sends it when resumed', async () => {
    const { sync, tournament, localLive, local } = setup();
    sync.setPaused(true);
    expect(local.getItem('setpoint.sync.paused')).toBe('true');
    expect(sync.status()).toBe('paused');
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    expect(localLive.syncLocalLiveTournament).not.toHaveBeenCalled();
    expect(sync.status()).toBe('paused');
    sync.setPaused(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(local.getItem('setpoint.sync.paused')).toBe('false');
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledOnce();
    expect(sync.status()).toBe('synced');
  });

  it('sends now even while paused, and only what is pending', async () => {
    const { sync, tournament, localLive } = setup();
    sync.setPaused(true);
    sync.stage(scored(tournament.state()));
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledOnce();
    expect(sync.hasPending()).toBe(false);
    expect(sync.paused()).toBe(true);
  });

  it('reports a preference that could not be saved', () => {
    const { sync, local } = setup();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    sync.setPaused(true);
    expect(sync.error()).toBe('prefsNotSaved');
    expect(sync.paused()).toBe(true);
  });

  it('follows the connection, and does not send while offline', async () => {
    const { sync, tournament, localLive, connectivity } = setup();
    connectivity.set(false);
    expect(sync.online()).toBe(false);
    expect(sync.status()).toBe('offline');
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    expect(localLive.syncLocalLiveTournament).not.toHaveBeenCalled();
    connectivity.set(true);
    expect(sync.online()).toBe(true);
    await sync.run();
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledOnce();
  });

  it('does not poll while the page is hidden', async () => {
    const { sync, tournament, localLive, clock } = setup();
    localLive.syncLocalLiveTournament.mockRejectedValueOnce(new Error('boom'));
    sync.stage(scored(tournament.state()));
    await vi.advanceTimersByTimeAsync(250);
    clock.advance(20000);
    sync.start();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(localLive.syncLocalLiveTournament).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it('polls a shared tournament that has not started, until it has a schedule', async () => {
    const base = { ...storedTournament(), hostingMode: 'shared' as const, sharedTournamentId: 's1', rounds: [] };
    const { sync, owned } = setup({}, base);
    owned.setModerator(true);
    const refresh = vi.spyOn(owned, 'refresh').mockResolvedValue();
    sync.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(refresh).toHaveBeenCalledWith('s1');
    sync.stop();
  });
});

describe('restoring after a reload', () => {
  it('reads the pause preference and puts back what was still waiting to be sent', () => {
    const fakes = shellFakes();
    const pending = scored(localRunning());
    fakes.local.setItem('setpoint.sync.paused', 'true');
    fakes.local.setItem(
      'setpoint.sync.local.a1',
      JSON.stringify({ version: 1, base: localRunning(), pending, revision: 3 }),
    );
    TestBed.configureTestingModule({ providers: fakes.providers });
    const tournament = TestBed.inject(CurrentTournament);
    tournament.set(localRunning());
    const sync = TestBed.inject(TournamentSync);
    sync.restore();
    expect(sync.paused()).toBe(true);
    expect(tournament.state()).toEqual(pending);
  });

  it('makes the moderator of a started shared tournament again', () => {
    const fakes = shellFakes();
    const base = {
      ...storedTournament(),
      hostingMode: 'shared' as const,
      sharedTournamentId: 's1',
      sharedStatus: 'active' as const,
    };
    fakes.local.setItem('setpoint.sync.shared.s1', JSON.stringify({ version: 1, base, pending: null, revision: 0 }));
    TestBed.configureTestingModule({ providers: fakes.providers });
    TestBed.inject(CurrentTournament).set(base);
    const sync = TestBed.inject(TournamentSync);
    sync.restore();
    expect(TestBed.inject(OwnedSharedTournament).moderator()).toBe(true);
  });

  it('says the queue cannot be read when the storage fails', () => {
    const fakes = shellFakes();
    TestBed.configureTestingModule({ providers: fakes.providers });
    vi.spyOn(fakes.local, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    TestBed.inject(CurrentTournament).set(localRunning());
    const sync = TestBed.inject(TournamentSync);
    sync.restore();
    expect(sync.error()).toBe('queueUnavailable');
  });

  it('starts the queue for a stored live link', () => {
    const fakes = shellFakes();
    fakes.local.setItem('setpoint.local.live.a1', LIVE);
    TestBed.configureTestingModule({ providers: fakes.providers });
    TestBed.inject(CurrentTournament).set(localRunning());
    const sync = TestBed.inject(TournamentSync);
    sync.restoreLiveLink();
    expect(TestBed.inject(LocalLiveLink).writeToken()).toBe('write-1');
    expect(fakes.local.getItem('setpoint.sync.local.a1')).not.toBeNull();
    expect(sync.available()).toBe(true);
  });
});

describe('another tab', () => {
  it('is seen by pendingNow, which reads the queue itself, while the cached hasPending is not', () => {
    const { sync, local, tournament } = setup();
    expect(sync.hasPending()).toBe(false);
    const record = JSON.parse(local.getItem('setpoint.sync.local.a1') ?? '{}') as object;
    local.setItem(
      'setpoint.sync.local.a1',
      JSON.stringify({ ...record, pending: scored(tournament.state()), revision: 5 }),
    );
    expect(sync.pendingNow()).toBe(true);
    expect(sync.hasPending()).toBe(true);
  });
});

describe('leaving the tournament', () => {
  it('forgets the queue of the tournament in use', () => {
    const { sync, local } = setup();
    expect(local.getItem('setpoint.sync.local.a1')).not.toBeNull();
    sync.removeCurrent();
    expect(local.getItem('setpoint.sync.local.a1')).toBeNull();
    expect(sync.hasPendingFor('local', 'a1')).toBe(false);
  });

  it('drops the queue before another tournament takes its place, unless it is the same local one', () => {
    const { sync, local } = setup();
    expect(sync.discardCurrentExcept('a1')).toBe(true);
    expect(local.getItem('setpoint.sync.local.a1')).not.toBeNull();
    expect(sync.discardCurrentExcept('other')).toBe(true);
    expect(local.getItem('setpoint.sync.local.a1')).toBeNull();
  });

  it('refuses when the queue cannot be removed', () => {
    const { sync, local } = setup();
    vi.spyOn(local, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(sync.discardCurrentExcept('other')).toBe(false);
  });

  it('keeps an unfinished tournament pending the way it was', () => {
    const { sync, tournament } = setup({}, tournamentState({ players: namedPlayers(8), analyticsId: 'a1' }));
    expect(tournament.state().rounds).toEqual([]);
    expect(sync.available()).toBe(true);
  });
});

describe('a shared tournament applied from the server', () => {
  it('prepares the sync base for an active tournament, and says so when it cannot', () => {
    const base = {
      ...storedTournament(),
      hostingMode: 'shared' as const,
      sharedTournamentId: 's1',
      sharedStatus: 'active' as const,
    };
    const { sync, owned, local } = setup({}, base);
    owned.setModerator(true);
    const snapshot: SharedTournamentSnapshot = {
      id: 's1',
      status: 'active',
      capacity: 8,
      state: base,
      inviteToken: '',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
    };
    owned.apply(snapshot);
    expect(local.getItem('setpoint.sync.shared.s1')).not.toBeNull();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    owned.apply(snapshot);
    expect(sync.error()).toBe('prepareFailed');
  });
});
