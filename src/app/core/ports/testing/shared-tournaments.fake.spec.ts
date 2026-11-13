import { sharedTournamentsContract } from './shared-tournaments.contract';
import { FakeSharedTournaments } from './shared-tournaments.fake';

sharedTournamentsContract('FakeSharedTournaments', () => {
  const fake = new FakeSharedTournaments();
  return { port: fake, given: (token, snapshot) => fake.given(token, snapshot), fail: (code) => fake.fail(code) };
});
