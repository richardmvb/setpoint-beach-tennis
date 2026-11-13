import { describe, expect, it } from 'vitest';
import { clockContract } from './clock.contract';
import { FakeClock } from './clock.fake';

clockContract('FakeClock', () => new FakeClock());

describe('FakeClock', () => {
  it('stays still until it is advanced', () => {
    const clock = new FakeClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
    clock.set(9);
    expect(clock.date().getTime()).toBe(9);
  });
});
