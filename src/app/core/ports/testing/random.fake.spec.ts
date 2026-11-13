import { describe, expect, it } from 'vitest';
import { randomContract } from './random.contract';
import { FakeRandom } from './random.fake';

randomContract('FakeRandom', () => new FakeRandom(7));

describe('FakeRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const first = new FakeRandom(42);
    const second = new FakeRandom(42);
    expect([first.next(), first.int(10), first.uuid()]).toEqual([second.next(), second.int(10), second.uuid()]);
  });

  it('makes UUID-shaped ids', () => {
    expect(new FakeRandom().uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
