import type { Provider } from '@angular/core';
import { CLOCK } from '../../ports/clock.port';
import { LOCAL_STORE, SESSION_STORE } from '../../ports/key-value-store.port';
import { BrowserLocalStore, BrowserSessionStore } from './browser-stores';
import { SystemClock } from './system-clock';

/** Binds the browser capabilities (storage, and later clock, randomness and config) to the browser. */
export function provideBrowserAdapters(): Provider[] {
  return [
    { provide: LOCAL_STORE, useExisting: BrowserLocalStore },
    { provide: SESSION_STORE, useExisting: BrowserSessionStore },
    { provide: CLOCK, useExisting: SystemClock },
  ];
}
