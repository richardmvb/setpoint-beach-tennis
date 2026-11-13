import type { AppUser, AuthChange, AuthPort } from '../auth.port';

/** In-memory auth: signing in anonymously creates a user and notifies listeners. */
export class FakeAuth implements AuthPort {
  configured = true;
  readonly loginRequests: { email: string; redirectTo: string }[] = [];
  private user: AppUser | null = null;
  private readonly listeners = new Set<(change: AuthChange, user: AppUser | null) => void>();

  finishUrlSignIn(): Promise<void> {
    return Promise.resolve();
  }
  currentUser(): Promise<AppUser | null> {
    return Promise.resolve(this.user);
  }
  onAuthStateChange(callback: (change: AuthChange, user: AppUser | null) => void): () => void {
    this.listeners.add(callback);
    return () => void this.listeners.delete(callback);
  }
  requestModeratorLogin(email: string, redirectTo: string): Promise<void> {
    this.loginRequests.push({ email, redirectTo });
    return Promise.resolve();
  }
  signInAnonymously(): Promise<void> {
    this.user = { id: 'anonymous-user' };
    for (const listener of this.listeners) listener('signed-in', this.user);
    return Promise.resolve();
  }
  /** Simulates the session ending (expired, or signed out in another tab). */
  simulateSignOut(): void {
    this.user = null;
    for (const listener of this.listeners) listener('signed-out', null);
  }
}
