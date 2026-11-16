import { ownedSharedTournamentsContract, sharedTournamentsContract } from './shared-tournaments.contract';
import { FakeSharedTournaments } from './shared-tournaments.fake';

sharedTournamentsContract('FakeSharedTournaments', () => {
  const fake = new FakeSharedTournaments();
  return { port: fake, given: (token, snapshot) => fake.given(token, snapshot), fail: (code) => fake.fail(code) };
});

ownedSharedTournamentsContract('FakeSharedTournaments', () => {
  const fake = new FakeSharedTournaments();
  return {
    port: fake,
    given: (snapshot) => fake.givenOwned(snapshot),
    // The fake rotates on its own; the token the contract names is only what the real server would answer.
    givenRotation: () => undefined,
    fail: (code) => fake.fail(code),
  };
});
