import { TestBed } from '@angular/core/testing';
import { provideBrowserAdapters } from '../core/adapters/browser/provide-browser-adapters';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH } from '../core/ports/auth.port';
import { LOCAL_LIVE, LocalLiveRepository } from '../core/ports/tournaments.port';
import { FakeAuth } from '../core/ports/testing/auth.fake';
import type { TournamentState } from '../core/models';
import { TournamentReportComponent } from './tournament-report.component';

const PLAYERS = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
  { id: 'd', name: 'Dani' },
];
const BASE = {
  version: 1,
  name: 'Torneio de teste',
  size: 8,
  courts: 2,
  gamesToWin: 4,
  roundCount: 7,
  createdAt: '2026-11-08T10:00:00Z',
  finishedAt: '2026-11-08T12:00:00Z',
  players: PLAYERS,
  tournamentMode: 'super',
  doublesFormat: 'open',
  groups: [],
  rounds: [],
  finals: null,
} as unknown as TournamentState;

describe('TournamentReportComponent final link', () => {
  let created: TournamentState[];
  let serverStatus: 'completed' | 'active';
  let auth: FakeAuth;

  /** A repository that answers like the server: the existing live tournament has the base state. */
  const localLive: Partial<LocalLiveRepository> = {
    getLocalLiveTournament: () => Promise.resolve({ id: 'live-1', status: serverStatus, state: BASE }),
    createLocalLiveTournament: (state) => {
      created.push(state);
      return Promise.resolve({ id: 'live-2', readToken: 'n'.repeat(64), writeToken: 'w'.repeat(64) });
    },
  };

  function render(state: TournamentState, existingLiveUrl = '') {
    const fixture = TestBed.createComponent(TournamentReportComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('existingLiveUrl', existingLiveUrl);
    return fixture.componentInstance;
  }

  beforeEach(() => {
    localStorage.clear();
    created = [];
    serverStatus = 'completed';
    auth = new FakeAuth();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideBrowserAdapters(),
        { provide: AUTH, useValue: auth },
        { provide: LOCAL_LIVE, useValue: localLive },
      ],
    });
  });

  it('reuses the existing live link when the server copy is finished and up to date', async () => {
    const liveUrl = `https://example.test/setpoint/?live=${'r'.repeat(64)}`;
    const component = render({ ...BASE, hostingMode: 'local', analyticsId: 'local-id' }, liveUrl);

    await component.generateFinalLink();

    expect(component.finalLink).toBe(liveUrl);
    expect(created).toHaveLength(0);
  });

  it('publishes a new final link when the server copy is stale, and a restored session shows the same link', async () => {
    const liveUrl = `https://example.test/setpoint/?live=${'r'.repeat(64)}`;
    serverStatus = 'active';
    const state = { ...BASE, hostingMode: 'local', analyticsId: 'another-id' } as TournamentState;
    const stale = render(state, liveUrl);

    await stale.generateFinalLink();

    expect(stale.finalLink).toMatch(/\?live=n{64}$/);
    expect(created).toHaveLength(1);
    expect(created[0]?.finishedAt).toBe(BASE.finishedAt);
    expect(created[0]?.hostingMode).toBe('local');

    const restored = TestBed.createComponent(TournamentReportComponent);
    restored.componentRef.setInput('state', state);
    restored.detectChanges();
    expect(restored.componentInstance.finalLink).toBe(stale.finalLink);
  });

  it('asks a shared tournament owner to sign in, then publishes a local copy without the shared identity', async () => {
    const shared = render({
      ...BASE,
      hostingMode: 'shared',
      sharedTournamentId: 'shared-id',
      sharedStatus: 'completed',
    });

    await shared.generateFinalLink();
    expect(created).toHaveLength(0);
    expect(shared.message).toMatch(/sessão do moderador/);

    await auth.signInAnonymously();
    await shared.generateFinalLink();

    expect(created).toHaveLength(1);
    expect(created[0]?.hostingMode).toBe('local');
    expect(created[0]?.sharedTournamentId).toBeUndefined();
    expect(created[0]?.sharedStatus).toBeUndefined();
  });
});
