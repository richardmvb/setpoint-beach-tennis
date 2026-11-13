import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RANDOM } from '../../ports/random.port';
import { randomContract } from '../../ports/testing/random.contract';
import { provideBrowserAdapters } from './provide-browser-adapters';

function random() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideBrowserAdapters()] });
  return TestBed.inject(RANDOM);
}

randomContract('BrowserRandom', random);

describe('BrowserRandom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('next() reads Math.random on every call, so a seeded replacement is honored (the e2e draw depends on it)', () => {
    const subject = random();
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    expect([subject.next(), subject.next()]).toEqual([0.25, 0.75]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('int() draws from crypto.getRandomValues and rejects samples that would bias the result', () => {
    const samples = [0xffff_ffff, 7];
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint32Array) => {
        array[0] = samples.shift() ?? 0;
        return array;
      },
    });
    // 0xffffffff is above the largest multiple of 5 that fits in 2^32, so it is discarded; 7 % 5 = 2.
    expect(random().int(5)).toBe(2);
    expect(samples).toEqual([]);
  });

  it('int() falls back to Math.random when crypto.getRandomValues is missing', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(random().int(10)).toBe(5);
  });

  it('uuid() uses crypto.randomUUID, and falls back to a time-and-random string without it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' });
    expect(random().uuid()).toBe('fixed-uuid');
    vi.stubGlobal('crypto', {});
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(random().uuid()).toMatch(/^\d+-8$/);
  });
});
