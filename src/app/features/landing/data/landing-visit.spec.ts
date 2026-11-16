import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../testing/memory-storage';
import { landingSeen, markLandingSeen } from './landing-visit';

const broken = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('landing visit', () => {
  it('a new device has not seen the landing, and leaving it is remembered', () => {
    const local = new MemoryStorage();
    expect(landingSeen(local)).toBe(false);
    markLandingSeen(local);
    expect(landingSeen(local)).toBe(true);
    expect(local.getItem('setpoint.landing.seen')).toBe('true');
  });

  it('only the stored value "true" counts as seen', () => {
    const local = new MemoryStorage();
    local.setItem('setpoint.landing.seen', 'yes');
    expect(landingSeen(local)).toBe(false);
  });

  it('without storage the landing is skipped and marking it does not throw', () => {
    expect(landingSeen(broken)).toBe(true);
    expect(() => markLandingSeen(broken)).not.toThrow();
  });
});
