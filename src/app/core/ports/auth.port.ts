import { InjectionToken } from '@angular/core';

/** The signed-in person, in the app's terms. The vendor's user object never leaves the adapter. */
export interface AppUser {
  readonly id: string;
}

export type AuthChange = 'signed-in' | 'signed-out' | 'other';

export interface AuthPort {
  /** True when the cloud backend is configured for this deploy. Cloud features are off otherwise. */
  readonly configured: boolean;
  /** Completes a sign-in that arrived in the URL (email link) and removes the tokens from it. */
  finishUrlSignIn(): Promise<void>;
  currentUser(): Promise<AppUser | null>;
  /** Calls back on every sign-in or sign-out. Returns a function that stops the calls. */
  onAuthStateChange(callback: (change: AuthChange, user: AppUser | null) => void): () => void;
  /** Sends a sign-in link to the moderator's email. */
  requestModeratorLogin(email: string, redirectTo: string): Promise<void>;
  signInAnonymously(): Promise<void>;
}
export const AUTH = new InjectionToken<AuthPort>('AuthPort');
