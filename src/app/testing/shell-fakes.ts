import type { Provider } from '@angular/core';
import { vi } from 'vitest';
import { DialogService } from '../core/dialog.service';
import type { TournamentState } from '../core/models';
import { ANALYTICS } from '../core/ports/analytics.port';
import { APP_CONFIG } from '../core/ports/app-config.port';
import { ARCHIVE } from '../core/ports/archive.port';
import { AUTH } from '../core/ports/auth.port';
import { CLOCK } from '../core/ports/clock.port';
import { CONNECTIVITY } from '../core/ports/connectivity.port';
import { LOCAL_STORE, SESSION_STORE } from '../core/ports/key-value-store.port';
import { TOURNAMENT_FEED } from '../core/ports/live-feed.port';
import { RANDOM } from '../core/ports/random.port';
import { FakeAnalytics } from '../core/ports/testing/analytics.fake';
import { testConfig } from '../core/ports/testing/app-config.fake';
import { FakeAuth } from '../core/ports/testing/auth.fake';
import { FakeClock } from '../core/ports/testing/clock.fake';
import { FakeConnectivity } from '../core/ports/testing/connectivity.fake';
import { FakeTournamentFeed } from '../core/ports/testing/feed.fake';
import { FakeRandom } from '../core/ports/testing/random.fake';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../core/ports/tournaments.port';
import { URL_STATE } from '../core/routing/url-state';
import { MemoryStorage } from './memory-storage';

export interface ShellFakeOptions {
  online?: boolean;
  /** False is a deploy without a backend. */
  configured?: boolean;
  /** The address is `/dashboard`. */
  dashboard?: boolean;
  /** The address opens someone else's tournament (a live link). */
  sharedView?: boolean;
  lockScreen?: boolean;
}

/**
 * Every port the shell's services use, bound to in-memory fakes or `vi.fn` stubs (analytics started), for their specs:
 * the connection, the clock, storage, the cloud repositories (`shared`, `localLive`, `archive`), the address and the
 * dialogs. `confirm` answers true until a test changes it.
 */
export function shellFakes(options: ShellFakeOptions = {}) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const clock = new FakeClock();
  const random = new FakeRandom();
  const connectivity = new FakeConnectivity(options.online ?? true);
  const auth = new FakeAuth();
  auth.configured = options.configured ?? true;
  const analytics = new FakeAnalytics();
  analytics.start();
  const feed = new FakeTournamentFeed();
  const shared = {
    startSharedTournament: vi.fn(),
    syncSharedTournament: vi.fn(),
    cancelSharedTournament: vi.fn(() => Promise.resolve()),
    getOwnedSharedTournament: vi.fn(),
  };
  const localLive = {
    syncLocalLiveTournament: vi.fn(),
    createLocalLiveTournament: vi.fn(() =>
      Promise.resolve({ id: 'live-1', readToken: 'read-1', writeToken: 'write-1' }),
    ),
  };
  const archive = {
    saveLocalTournamentArchive: vi.fn((_id: string, _state: TournamentState) => Promise.resolve()),
    recordLocalTournamentMetrics: vi.fn((_state: TournamentState, _abandoned?: boolean) => Promise.resolve()),
  };
  const dialogs = {
    confirm: vi.fn((_options: unknown) => Promise.resolve(true)),
    open: vi.fn((_component: unknown) => Promise.resolve(undefined)),
  };
  const url = {
    inviteToken: '',
    liveToken: options.sharedView ? 'live-token' : '',
    dashboardViewerId: '',
    dashboardViewerSource: null,
    dashboardPath: options.dashboard ?? false,
    authCallback: false,
  };
  const urlState = {
    basePath: '',
    snapshot: () => url,
    onPathChange: () => () => undefined,
    goToDashboard: vi.fn(),
    goHome: vi.fn(),
    clearAuthFragment: () => Promise.resolve(),
    inviteUrl: (token: string) => `https://app.test/?invite=${token}`,
    liveUrl: (token: string) => `https://app.test/?live=${token}`,
  };
  const providers: Provider[] = [
    { provide: LOCAL_STORE, useValue: local },
    { provide: SESSION_STORE, useValue: session },
    { provide: CLOCK, useValue: clock },
    { provide: RANDOM, useValue: random },
    { provide: CONNECTIVITY, useValue: connectivity },
    { provide: AUTH, useValue: auth },
    { provide: ANALYTICS, useValue: analytics },
    { provide: TOURNAMENT_FEED, useValue: feed },
    { provide: SHARED_TOURNAMENTS, useValue: shared },
    { provide: LOCAL_LIVE, useValue: localLive },
    { provide: ARCHIVE, useValue: archive },
    { provide: DialogService, useValue: dialogs },
    { provide: URL_STATE, useValue: urlState },
    { provide: APP_CONFIG, useValue: testConfig({ lockScreenEnabled: options.lockScreen ?? false }) },
  ];
  return {
    local,
    session,
    clock,
    random,
    connectivity,
    auth,
    analytics,
    feed,
    shared,
    localLive,
    archive,
    dialogs,
    urlState,
    providers,
  };
}

/** The events analytics captured, by name. */
export function capturedEvents(analytics: FakeAnalytics): string[] {
  return analytics.calls.map((call) => (call.kind === 'capture' ? call.event : call.kind));
}
