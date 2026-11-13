import { feedContract } from './feed.contract';
import { FakeTournamentFeed } from './feed.fake';

feedContract('FakeTournamentFeed', () => {
  const fake = new FakeTournamentFeed();
  return { port: fake, trigger: (kind, id) => fake.trigger(kind, id) };
});
