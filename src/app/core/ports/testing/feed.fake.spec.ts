import { describe, expect, it } from 'vitest';
import { feedContract } from './feed.contract';
import { FakeTournamentFeed } from './feed.fake';

feedContract('FakeTournamentFeed', () => {
  const fake = new FakeTournamentFeed();
  return { port: fake, trigger: (kind, id) => fake.trigger(kind, id) };
});

describe('FakeTournamentFeed', () => {
  it('lists what is being watched', () => {
    const fake = new FakeTournamentFeed();
    const stop = fake.watchLocal('a', () => undefined);
    fake.watchShared('b', () => undefined);
    expect(fake.watching()).toEqual(['local:a', 'shared:b']);
    stop();
    fake.stopSharedWatch('b');
    expect(fake.watching()).toEqual([]);
  });
});
