import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { keyValueStoreContract } from '../../ports/testing/key-value-store.contract';
import { LOCAL_STORE, SESSION_STORE } from '../../ports/key-value-store.port';
import { provideBrowserAdapters } from './provide-browser-adapters';

function stores() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideBrowserAdapters()] });
  return { local: TestBed.inject(LOCAL_STORE), session: TestBed.inject(SESSION_STORE) };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

keyValueStoreContract('BrowserLocalStore', () => stores().local);
keyValueStoreContract('BrowserSessionStore', () => stores().session);

describe('browser stores', () => {
  it('write to the real localStorage and sessionStorage, and keep them apart', () => {
    const { local, session } = stores();
    local.setItem('shared-key', 'from-local');
    session.setItem('shared-key', 'from-session');
    expect(localStorage.getItem('shared-key')).toBe('from-local');
    expect(sessionStorage.getItem('shared-key')).toBe('from-session');
  });

  it('read the browser storage at call time, so data written elsewhere is seen', () => {
    const { local } = stores();
    localStorage.setItem('written-elsewhere', 'yes');
    expect(local.getItem('written-elsewhere')).toBe('yes');
  });
});
