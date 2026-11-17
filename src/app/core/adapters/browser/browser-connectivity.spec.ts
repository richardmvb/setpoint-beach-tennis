import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectivityContract } from '../../ports/testing/connectivity.contract';
import { BrowserConnectivity } from './browser-connectivity';

describe('BrowserConnectivity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads navigator.onLine and reports the events until stopped', () => {
    const connectivity = TestBed.inject(BrowserConnectivity);
    const seen: boolean[] = [];
    const stop = connectivity.onChange((online) => seen.push(online));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(connectivity.online()).toBe(false);
    window.dispatchEvent(new Event('offline'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    stop();
    window.dispatchEvent(new Event('online'));
    expect(seen).toEqual([false, true]);
  });
});

connectivityContract('BrowserConnectivity', () => {
  const connectivity = TestBed.inject(BrowserConnectivity);
  return {
    connectivity,
    change: (online) => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
      window.dispatchEvent(new Event(online ? 'online' : 'offline'));
    },
  };
});
