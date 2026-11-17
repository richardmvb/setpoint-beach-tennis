import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shellFakes } from '../testing/shell-fakes';
import { storedTournament } from '../testing/tournament-state';
import { CurrentTournament } from './current-tournament';
import { LocalLiveLink } from './local-live-link';
import { Notices } from './notices';
import { SavedTournaments } from './saved-tournaments';
import { TournamentPersistence } from './tournament-persistence';
import { TournamentSync } from './sync/tournament-sync';

const running = () => ({ ...storedTournament(), hostingMode: 'local' as const, analyticsId: 'a1' });

function setup() {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ providers: fakes.providers });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(running());
  return {
    ...fakes,
    tournament,
    persistence: TestBed.inject(TournamentPersistence),
    notices: TestBed.inject(Notices),
    sync: TestBed.inject(TournamentSync),
    saved: TestBed.inject(SavedTournaments),
    link: TestBed.inject(LocalLiveLink),
  };
}

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('TournamentPersistence', () => {
  it('stores the tournament on the device, in the library, and says what the caller asked to say', () => {
    const { persistence, local, notices, saved } = setup();
    persistence.save('Placar removido.');
    expect(JSON.parse(local.getItem('setpoint.tournament.v1') ?? '{}')).toMatchObject({ analyticsId: 'a1' });
    expect(saved.library.list()).toHaveLength(1);
    expect(notices.notice()).toEqual({ tone: 'success', text: 'Placar removido.' });
  });

  it('says nothing without a message', () => {
    const { persistence, notices } = setup();
    persistence.save();
    expect(notices.notice()).toBeNull();
  });

  it('skips the library and the upload when asked', async () => {
    const { persistence, saved, archive } = setup();
    persistence.save(undefined, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(saved.library.list()).toEqual([]);
    expect(archive.saveLocalTournamentArchive).not.toHaveBeenCalled();
  });

  it('stages the change for the live link before saving', () => {
    const { persistence, sync, link, local, tournament } = setup();
    local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'live-1', readToken: 'r', writeToken: 'w' }));
    link.restore(tournament.state());
    sync.initialize('local', 'a1', tournament.state());
    tournament.update((state) => ({ ...state, name: 'Mudou' }));
    persistence.save();
    expect(sync.hasPending()).toBe(true);
  });

  it('shows why the device could not store it', () => {
    const { persistence, notices, local } = setup();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    persistence.save('ok');
    expect(notices.notice()).toMatchObject({ tone: 'error' });
    expect(notices.notice()?.text).toContain('armazenamento local');
  });

  it('reacts to a new live link: starts its queue, saves, re-queues the archive and uploads', async () => {
    const { persistence: _persistence, link, sync, archive, saved, tournament, local, localLive } = setup();
    localLive.syncLocalLiveTournament.mockImplementation((_token: string, _base: unknown, next: unknown) =>
      Promise.resolve({ id: 'live-1', status: 'active', state: next }),
    );
    await link.createOrCopy();
    expect(local.getItem('setpoint.sync.local.a1')).not.toBeNull();
    expect(sync.hasPendingFor('local', 'a1')).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(sync.hasPendingFor('local', 'a1')).toBe(false);
    expect(archive.saveLocalTournamentArchive).toHaveBeenCalledOnce();
    expect(saved.library.pendingArchives()).toEqual([]);
    expect(tournament.state().analyticsId).toBe('a1');
  });
});
