import type { Provider } from '@angular/core';
import { ANALYTICS, SURVEYS } from '../../core/ports/analytics.port';
import { APP_CONFIG } from '../../core/ports/app-config.port';
import { AUTH } from '../../core/ports/auth.port';
import { CLOCK } from '../../core/ports/clock.port';
import { DASHBOARD } from '../../core/ports/dashboard.port';
import { FakeAnalytics, FakeSurveys } from '../../core/ports/testing/analytics.fake';
import { testConfig } from '../../core/ports/testing/app-config.fake';
import { FakeAuth } from '../../core/ports/testing/auth.fake';
import { FakeClock } from '../../core/ports/testing/clock.fake';
import { FakeDashboard } from '../../core/ports/testing/dashboard.fake';
import { URL_STATE, type UrlState } from '../../core/routing/url-state';

/**
 * Every port the dashboard uses, bound to in-memory fakes, for the store and page specs. `signedIn` starts with a
 * session (FakeAuth signs in anonymously, which is all the dashboard checks); the data comes from `dashboard.given*`.
 */
export async function dashboardFakes(options: { signedIn?: boolean } = {}) {
  const fakes = {
    auth: new FakeAuth(),
    dashboard: new FakeDashboard(),
    clock: new FakeClock(),
    analytics: new FakeAnalytics(),
    surveys: new FakeSurveys(),
  };
  if (options.signedIn) await fakes.auth.signInAnonymously();
  const urlState: Pick<UrlState, 'basePath' | 'dashboardUrl' | 'dashboardViewerUrl'> = {
    basePath: '/setpoint-beach-tennis',
    dashboardUrl: () => 'https://example.test/setpoint-beach-tennis/dashboard',
    dashboardViewerUrl: (id, source) =>
      `https://example.test/setpoint-beach-tennis/?dashboardTournament=${id}&source=${source}`,
  };
  const providers: Provider[] = [
    { provide: AUTH, useValue: fakes.auth },
    { provide: DASHBOARD, useValue: fakes.dashboard },
    { provide: CLOCK, useValue: fakes.clock },
    { provide: ANALYTICS, useValue: fakes.analytics },
    { provide: SURVEYS, useValue: fakes.surveys },
    { provide: URL_STATE, useValue: urlState },
    { provide: APP_CONFIG, useValue: testConfig({ buildVersion: 7 }) },
  ];
  return { ...fakes, providers };
}
