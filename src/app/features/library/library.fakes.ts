import type { Provider } from '@angular/core';
import { CLOCK } from '../../core/ports/clock.port';
import { ANALYTICS } from '../../core/ports/analytics.port';
import { LOCAL_STORE, SESSION_STORE } from '../../core/ports/key-value-store.port';
import { FakeAnalytics } from '../../core/ports/testing/analytics.fake';
import { FakeClock } from '../../core/ports/testing/clock.fake';
import { MemoryStorage } from '../../testing/memory-storage';

/** Every port the saved-tournaments list uses, bound to in-memory fakes (analytics already started), for its specs. */
export function libraryFakes() {
  const fakes = { local: new MemoryStorage(), analytics: new FakeAnalytics(), clock: new FakeClock() };
  fakes.analytics.start();
  const providers: Provider[] = [
    { provide: LOCAL_STORE, useValue: fakes.local },
    { provide: SESSION_STORE, useValue: new MemoryStorage() },
    { provide: ANALYTICS, useValue: fakes.analytics },
    { provide: CLOCK, useValue: fakes.clock },
  ];
  return { ...fakes, providers };
}
