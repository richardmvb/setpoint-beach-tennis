import { describe, expect, it } from 'vitest';
import { authContract } from './auth.contract';
import { FakeAuth } from './auth.fake';

authContract('FakeAuth', () => new FakeAuth());

describe('FakeAuth', () => {
  it('records moderator login requests', async () => {
    const auth = new FakeAuth();
    await auth.requestModeratorLogin('a@b.c', 'https://app/dashboard');
    expect(auth.loginRequests).toEqual([{ email: 'a@b.c', redirectTo: 'https://app/dashboard' }]);
  });
});
