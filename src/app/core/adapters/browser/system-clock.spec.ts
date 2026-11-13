import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CLOCK } from '../../ports/clock.port';
import { clockContract } from '../../ports/testing/clock.contract';
import { provideBrowserAdapters } from './provide-browser-adapters';

function clock() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideBrowserAdapters()] });
  return TestBed.inject(CLOCK);
}

clockContract('SystemClock', clock);

describe('SystemClock', () => {
  it('reads the time on every call, so faked system time is honored', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-13T10:00:00.000Z'));
      const subject = clock();
      expect(subject.iso()).toBe('2026-11-13T10:00:00.000Z');
      vi.advanceTimersByTime(1500);
      expect(subject.now() - new Date('2026-11-13T10:00:00.000Z').getTime()).toBe(1500);
    } finally {
      vi.useRealTimers();
    }
  });
});
