import type { Provider } from '@angular/core';
import type { SharedTournamentSnapshot } from '../../core/models';
import { PathCardService } from '../../core/path-card.service';
import { ANALYTICS, SURVEYS } from '../../core/ports/analytics.port';
import { APP_CONFIG } from '../../core/ports/app-config.port';
import { AUTH } from '../../core/ports/auth.port';
import { CLOCK } from '../../core/ports/clock.port';
import { DASHBOARD } from '../../core/ports/dashboard.port';
import { LOCAL_STORE, SESSION_STORE } from '../../core/ports/key-value-store.port';
import { TOURNAMENT_FEED } from '../../core/ports/live-feed.port';
import { FakeAnalytics, FakeSurveys } from '../../core/ports/testing/analytics.fake';
import { testConfig } from '../../core/ports/testing/app-config.fake';
import { FakeAuth } from '../../core/ports/testing/auth.fake';
import { FakeClock } from '../../core/ports/testing/clock.fake';
import { FakeDashboard } from '../../core/ports/testing/dashboard.fake';
import { FakeTournamentFeed } from '../../core/ports/testing/feed.fake';
import { FakeLocalLive } from '../../core/ports/testing/local-live.fake';
import { FakeSharedTournaments } from '../../core/ports/testing/shared-tournaments.fake';
import { LOCAL_LIVE, SHARED_TOURNAMENTS } from '../../core/ports/tournaments.port';
import type { UrlSnapshot } from '../../core/routing/app-url';
import { URL_STATE, type UrlState } from '../../core/routing/url-state';
import { MemoryStorage } from '../../testing/memory-storage';
import { tournamentState } from '../../testing/tournament-state';

/** An address with only the given parameters. */
function urlSnapshot(overrides: Partial<UrlSnapshot>): UrlSnapshot {
  return {
    inviteToken: '',
    liveToken: '',
    dashboardViewerId: '',
    dashboardViewerSource: null,
    dashboardPath: false,
    authCallback: false,
    ...overrides,
  };
}

/** A shared tournament in registration with one player, the moderator. */
export function sharedSnapshot(overrides: Partial<SharedTournamentSnapshot> = {}): SharedTournamentSnapshot {
  return {
    id: 'shared-1',
    status: 'registration',
    capacity: 8,
    state: tournamentState({
      name: 'Compartilhado',
      hostingMode: 'shared',
      players: [{ id: 'p1', name: 'Moderadora' }],
    }),
    inviteExpiresAt: '2099-01-01T00:00:00Z',
    expiresAt: null,
    canJoin: true,
    ...overrides,
  };
}

export interface SharedViewFakeOptions {
  url: Partial<UrlSnapshot>;
  /** False: the deploy has no backend (`AUTH.configured`). */
  configured?: boolean;
  local?: MemoryStorage;
}

/**
 * Every port the shared view uses, bound to in-memory fakes, for specs of the store and the page. Returns the fakes
 * so a spec can put data on the "server" (`given`), make it fail (`fail`), or trigger a realtime notice.
 */
export function sharedViewFakes(options: SharedViewFakeOptions) {
  const fakes = {
    shared: new FakeSharedTournaments(),
    live: new FakeLocalLive(),
    dashboard: new FakeDashboard(),
    feed: new FakeTournamentFeed(),
    analytics: new FakeAnalytics(),
    surveys: new FakeSurveys(),
    auth: new FakeAuth(),
    clock: new FakeClock(),
    local: options.local ?? new MemoryStorage(),
  };
  fakes.analytics.start();
  fakes.surveys.available = true;
  fakes.auth.configured = options.configured ?? true;
  const urlState: Pick<UrlState, 'snapshot'> = { snapshot: () => urlSnapshot(options.url) };
  const providers: Provider[] = [
    { provide: URL_STATE, useValue: urlState },
    { provide: AUTH, useValue: fakes.auth },
    { provide: TOURNAMENT_FEED, useValue: fakes.feed },
    { provide: SHARED_TOURNAMENTS, useValue: fakes.shared },
    { provide: LOCAL_LIVE, useValue: fakes.live },
    { provide: DASHBOARD, useValue: fakes.dashboard },
    { provide: CLOCK, useValue: fakes.clock },
    { provide: LOCAL_STORE, useValue: fakes.local },
    { provide: SESSION_STORE, useValue: new MemoryStorage() },
    { provide: ANALYTICS, useValue: fakes.analytics },
    { provide: SURVEYS, useValue: fakes.surveys },
    { provide: APP_CONFIG, useValue: testConfig({ buildVersion: 42 }) },
    { provide: PathCardService, useValue: { render: () => Promise.resolve(new Blob()) } },
  ];
  return { ...fakes, providers };
}
