import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollBehavior } from './motion';

afterEach(() => vi.unstubAllGlobals());

describe('scrollBehavior', () => {
  it('is smooth unless the person asked for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(scrollBehavior()).toBe('smooth');
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    expect(scrollBehavior()).toBe('auto');
  });

  it('is smooth where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(scrollBehavior()).toBe('smooth');
  });
});
