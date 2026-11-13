import { Injectable } from '@angular/core';
import type { KeyValueStore } from '../../ports/key-value-store.port';

function storageKeys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key !== null,
  );
}

/** `localStorage`, looked up on every call so a blocked or replaced storage behaves like the real one. */
@Injectable({ providedIn: 'root' })
export class BrowserLocalStore implements KeyValueStore {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
  keys(): string[] {
    return storageKeys(localStorage);
  }
}

/** `sessionStorage`, same rules. */
@Injectable({ providedIn: 'root' })
export class BrowserSessionStore implements KeyValueStore {
  getItem(key: string): string | null {
    return sessionStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    sessionStorage.removeItem(key);
  }
  keys(): string[] {
    return storageKeys(sessionStorage);
  }
}
