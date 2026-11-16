import type { Provider } from '@angular/core';
import { ANALYTICS } from '../../core/ports/analytics.port';
import { APP_CONFIG } from '../../core/ports/app-config.port';
import { LOCAL_STORE } from '../../core/ports/key-value-store.port';
import { FakeAnalytics } from '../../core/ports/testing/analytics.fake';
import { testConfig } from '../../core/ports/testing/app-config.fake';
import { MemoryStorage } from '../../testing/memory-storage';

/** Every port the landing page uses, bound to in-memory fakes (analytics already started), for its specs. */
export function landingFakes(options: { buildVersion?: number } = {}) {
  const fakes = { local: new MemoryStorage(), analytics: new FakeAnalytics() };
  fakes.analytics.start();
  const providers: Provider[] = [
    { provide: LOCAL_STORE, useValue: fakes.local },
    { provide: ANALYTICS, useValue: fakes.analytics },
    { provide: APP_CONFIG, useValue: testConfig({ buildVersion: options.buildVersion }) },
  ];
  return { ...fakes, providers };
}
