import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage';
import { namedPlayers, tournamentState } from '../testing/tournament-state';
import { CurrentTournament } from './current-tournament';
import { LocalLiveLink } from './local-live-link';
import type { TournamentState } from './models';
import { ANALYTICS } from './ports/analytics.port';
import { AUTH } from './ports/auth.port';
import { CLOCK } from './ports/clock.port';
import { LOCAL_STORE } from './ports/key-value-store.port';
import { RANDOM } from './ports/random.port';
import { FakeAnalytics } from './ports/testing/analytics.fake';
import { FakeAuth } from './ports/testing/auth.fake';
import { FakeClock } from './ports/testing/clock.fake';
import { FakeRandom } from './ports/testing/random.fake';
import { LOCAL_LIVE } from './ports/tournaments.port';
import { URL_STATE } from './routing/url-state';

const KEY = 'setpoint.local.live.a1';
const credentials = { id: 'live-1', readToken: 'read-1', writeToken: 'write-1' };

function setup(options: { configured?: boolean; createFails?: string; clipboard?: 'ok' | 'fail' } = {}) {
  const local = new MemoryStorage();
  const auth = new FakeAuth();
  auth.configured = options.configured ?? true;
  const analytics = new FakeAnalytics();
  analytics.start();
  const created: TournamentState[] = [];
  const repository = {
    createLocalLiveTournament: (state: TournamentState) => {
      created.push(state);
      return options.createFails ? Promise.reject(new Error(options.createFails)) : Promise.resolve(credentials);
    },
  };
  const copied: string[] = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (options.clipboard === 'fail') return Promise.reject(new Error('denied'));
        copied.push(text);
        return Promise.resolve();
      },
    },
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_STORE, useValue: local },
      { provide: AUTH, useValue: auth },
      { provide: LOCAL_LIVE, useValue: repository },
      { provide: ANALYTICS, useValue: analytics },
      { provide: CLOCK, useValue: new FakeClock() },
      { provide: RANDOM, useValue: new FakeRandom() },
      { provide: URL_STATE, useValue: { liveUrl: (token: string) => `https://app.test/?live=${token}` } },
    ],
  });
  const link = TestBed.inject(LocalLiveLink);
  const tournament = TestBed.inject(CurrentTournament);
  const published: { id: string; state: TournamentState }[] = [];
  link.connect({ published: (id, state) => published.push({ id, state }) });
  return { link, tournament, local, analytics, created, copied, published };
}

const running = (overrides: Partial<TournamentState> = {}) =>
  tournamentState({ players: namedPlayers(8), analyticsId: 'a1', startedAt: '2026-11-13T10:00:00.000Z', ...overrides });

describe('LocalLiveLink', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.restoreAllMocks());

  it('restores the stored link of the tournament and exposes its write token', () => {
    const { link, local } = setup();
    local.setItem(KEY, JSON.stringify(credentials));
    expect(link.restore(running())).toBe(true);
    expect(link.url()).toBe('https://app.test/?live=read-1');
    expect(link.writeToken()).toBe('write-1');
    expect(link.analyticsId()).toBe('a1');
    expect(link.storedId('a1')).toBe('live-1');
  });

  it('restores nothing for a shared tournament, without an id, with partial or broken data', () => {
    const { link, local } = setup();
    local.setItem(KEY, JSON.stringify(credentials));
    expect(link.restore(running({ hostingMode: 'shared' }))).toBe(false);
    expect(link.restore(running({ analyticsId: undefined }))).toBe(false);
    local.setItem(KEY, JSON.stringify({ id: 'x' }));
    expect(link.restore(running())).toBe(false);
    local.setItem(KEY, 'not json');
    expect(link.restore(running())).toBe(false);
    expect(link.url()).toBe('');
    expect(link.storedId(undefined)).toBeUndefined();
    expect(link.storedId('a1')).toBeUndefined();
  });

  it('clear forgets the link and removes its stored credentials', () => {
    const { link, local } = setup();
    local.setItem(KEY, JSON.stringify(credentials));
    link.restore(running());
    link.clear();
    expect(link.url()).toBe('');
    expect(link.writeToken()).toBe('');
    expect(local.getItem(KEY)).toBeNull();
  });

  it('creates the link, stores its credentials unchanged, tells the shell and copies it', async () => {
    const { link, tournament, local, analytics, created, copied, published } = setup();
    tournament.set(running());
    await link.createOrCopy();
    expect(created).toHaveLength(1);
    expect(JSON.parse(local.getItem(KEY) ?? '')).toEqual(credentials);
    expect(published).toEqual([{ id: 'a1', state: created[0] }]);
    expect(link.url()).toBe('https://app.test/?live=read-1');
    expect(link.writeToken()).toBe('write-1');
    expect(copied).toEqual(['https://app.test/?live=read-1']);
    expect(link.notice()).toBe('copied');
    expect(link.error()).toBeNull();
    expect(link.loading()).toBe(false);
    const events = analytics.calls.flatMap((call) => (call.kind === 'capture' ? [call.event] : []));
    expect(events).toEqual(['local_live_link_created', 'local_live_link_copied']);
  });

  it('publishes a copy: later edits do not change what was sent', async () => {
    const { link, tournament, created } = setup();
    tournament.set(running());
    await link.createOrCopy();
    expect(created[0]).not.toBe(tournament.state());
  });

  it('gives a tournament without an analytics id one (a new object) before publishing', async () => {
    const { link, tournament, published } = setup();
    tournament.set(running({ analyticsId: undefined }));
    const before = tournament.state();
    await link.createOrCopy();
    expect(tournament.state()).not.toBe(before);
    expect(tournament.state().analyticsId).toBeTruthy();
    expect(published[0].id).toBe(tournament.state().analyticsId);
  });

  it('copies the existing link instead of creating another', async () => {
    const { link, tournament, local, created, copied } = setup();
    local.setItem(KEY, JSON.stringify(credentials));
    tournament.set(running());
    link.restore(tournament.state());
    await link.createOrCopy();
    expect(created).toHaveLength(0);
    expect(copied).toEqual(['https://app.test/?live=read-1']);
  });

  it('does nothing for a finished tournament', async () => {
    const { link, tournament, created } = setup();
    tournament.set(running({ finishedAt: '2026-11-13T12:00:00.000Z' }));
    await link.createOrCopy();
    expect(created).toHaveLength(0);
    expect(link.loading()).toBe(false);
  });

  it('says so when the deploy has no backend', async () => {
    const { link, tournament, created } = setup({ configured: false });
    tournament.set(running());
    await link.createOrCopy();
    expect(link.error()).toEqual({ key: 'notConfigured' });
    expect(created).toHaveLength(0);
  });

  it('keeps the failure text of the call as the detail', async () => {
    const { link, tournament } = setup({ createFails: 'rate limited' });
    tournament.set(running());
    await link.createOrCopy();
    expect(link.error()).toEqual({ key: 'createFailed', detail: 'rate limited' });
    expect(link.url()).toBe('');
    expect(link.loading()).toBe(false);
  });

  it('reports a copy that the browser refuses, keeping the link on screen', async () => {
    const { link, tournament } = setup({ clipboard: 'fail' });
    tournament.set(running());
    await link.createOrCopy();
    expect(link.error()).toEqual({ key: 'copyFailed' });
    expect(link.url()).toBe('https://app.test/?live=read-1');
    expect(link.notice()).toBeNull();
  });
});
