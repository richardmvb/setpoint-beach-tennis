import type { Provider } from '@angular/core';
import { APP_CONFIG } from '../../ports/app-config.port';
import { CLOCK } from '../../ports/clock.port';
import { CONNECTIVITY } from '../../ports/connectivity.port';
import { LOCAL_STORE, SESSION_STORE } from '../../ports/key-value-store.port';
import { RANDOM } from '../../ports/random.port';
import { BrowserConnectivity } from './browser-connectivity';
import { BrowserRandom } from './browser-random';
import { BrowserLocalStore, BrowserSessionStore } from './browser-stores';
import { readRuntimeConfig } from './runtime-config';
import { SystemClock } from './system-clock';

/** Binds the browser capabilities (storage, time, connection, randomness and runtime config) to the browser. */
export function provideBrowserAdapters(): Provider[] {
  return [
    { provide: LOCAL_STORE, useExisting: BrowserLocalStore },
    { provide: SESSION_STORE, useExisting: BrowserSessionStore },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: CONNECTIVITY, useExisting: BrowserConnectivity },
    { provide: RANDOM, useExisting: BrowserRandom },
    { provide: APP_CONFIG, useFactory: readRuntimeConfig },
  ];
}
