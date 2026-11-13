import { describe, expect, it } from 'vitest';
import type { AppUser, AuthChange, AuthPort } from '../auth.port';

/** Behavior every AuthPort implementation must have. Run it against the fake and against the real adapter. */
export function authContract(name: string, create: () => AuthPort): void {
  describe(`AuthPort contract: ${name}`, () => {
    it('has no current user before anyone signs in', async () => {
      expect(await create().currentUser()).toBeNull();
    });

    it('signing in anonymously creates a user, and listeners hear it', async () => {
      const auth = create();
      const heard: [AuthChange, AppUser | null][] = [];
      auth.onAuthStateChange((change, user) => heard.push([change, user]));

      await auth.signInAnonymously();

      const user = await auth.currentUser();
      expect(user?.id).toBeTruthy();
      expect(heard.at(-1)?.[0]).toBe('signed-in');
      expect(heard.at(-1)?.[1]).toEqual(user);
    });

    it('stops calling a listener once it is unsubscribed', async () => {
      const auth = create();
      let calls = 0;
      const stop = auth.onAuthStateChange(() => calls++);
      stop();

      await auth.signInAnonymously();

      expect(calls).toBe(0);
    });

    it('exposes the user as the app type only, with no vendor fields', async () => {
      const auth = create();
      await auth.signInAnonymously();
      expect(Object.keys((await auth.currentUser()) ?? {})).toEqual(['id']);
    });
  });
}
