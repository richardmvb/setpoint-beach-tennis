import { InjectionToken } from '@angular/core';

/**
 * String key-value storage, the same shape as the Web Storage API so callers keep their own `try/catch`
 * (storage can be full, blocked or missing). `OfflineSyncQueue` and `TournamentLibrary` only need the first three methods.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key currently stored (a snapshot, safe to remove from while looping). */
  keys(): string[];
}

/** Survives closing the browser. */
export const LOCAL_STORE = new InjectionToken<KeyValueStore>('LocalStore');
/** Lasts for the current tab only. */
export const SESSION_STORE = new InjectionToken<KeyValueStore>('SessionStore');
