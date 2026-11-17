import type { Provider } from '@angular/core';
import { ANALYTICS } from '../../core/ports/analytics.port';
import { APP_CONFIG } from '../../core/ports/app-config.port';
import { AUTH } from '../../core/ports/auth.port';
import { CLOCK } from '../../core/ports/clock.port';
import { LOCAL_STORE, SESSION_STORE } from '../../core/ports/key-value-store.port';
import { TOURNAMENT_FEED } from '../../core/ports/live-feed.port';
import { RANDOM } from '../../core/ports/random.port';
import { FakeAnalytics } from '../../core/ports/testing/analytics.fake';
import { testConfig } from '../../core/ports/testing/app-config.fake';
import { FakeAuth } from '../../core/ports/testing/auth.fake';
import { FakeClock } from '../../core/ports/testing/clock.fake';
import { FakeTournamentFeed } from '../../core/ports/testing/feed.fake';
import { FakeRandom } from '../../core/ports/testing/random.fake';
import { FakeSharedTournaments } from '../../core/ports/testing/shared-tournaments.fake';
import { SHARED_TOURNAMENTS } from '../../core/ports/tournaments.port';
import { URL_STATE } from '../../core/routing/url-state';
import { MemoryStorage } from '../../testing/memory-storage';
import { shellStubs } from '../../testing/shell-stubs';

/**
 * Every port the setup wizard uses, bound to in-memory fakes (analytics already started), for its specs. `configured`
 * false is a deploy without a backend (no shared mode). `hooks` records what was saved and shown.
 */
export function setupFakes(options: { configured?: boolean } = {}) {
  const fakes = {
    auth: new FakeAuth(),
    shared: new FakeSharedTournaments(),
    feed: new FakeTournamentFeed(),
    analytics: new FakeAnalytics(),
    clock: new FakeClock(),
    local: new MemoryStorage(),
    session: new MemoryStorage(),
    random: new FakeRandom(),
  };
  fakes.analytics.start();
  fakes.auth.configured = options.configured ?? true;
  const stubs = shellStubs();
  const providers: Provider[] = [
    ...stubs.providers,
    { provide: AUTH, useValue: fakes.auth },
    { provide: SHARED_TOURNAMENTS, useValue: fakes.shared },
    { provide: TOURNAMENT_FEED, useValue: fakes.feed },
    { provide: ANALYTICS, useValue: fakes.analytics },
    { provide: CLOCK, useValue: fakes.clock },
    { provide: LOCAL_STORE, useValue: fakes.local },
    { provide: SESSION_STORE, useValue: fakes.session },
    { provide: RANDOM, useValue: fakes.random },
    { provide: URL_STATE, useValue: { inviteUrl: (token: string) => `https://app.test/?invite=${token}` } },
    { provide: APP_CONFIG, useValue: testConfig({}) },
  ];
  return { ...fakes, hooks: stubs.hooks, providers };
}
