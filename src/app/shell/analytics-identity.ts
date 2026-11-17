import { inject, Injectable } from '@angular/core';
import { ANALYTICS } from '../core/ports/analytics.port';
import { AUTH, type AppUser } from '../core/ports/auth.port';

/** Tells analytics who is signed in (and forgets them on sign-out), so events of one person stay together. */
@Injectable({ providedIn: 'root' })
export class AnalyticsIdentity {
  private readonly analytics = inject(ANALYTICS);
  private readonly auth = inject(AUTH);
  private identifiedUserId: string | null = null;
  private stopListening: (() => void) | null = null;

  /** Listens to sign-ins and sign-outs, and identifies the person who is already signed in. */
  start(): void {
    this.stopListening ??= this.auth.onAuthStateChange((change, user) => {
      if (change === 'signed-in' && user) this.identify(user);
      if (change === 'signed-out') {
        this.analytics.reset();
        this.identifiedUserId = null;
      }
    });
    void this.identifyCurrent();
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  async identifyCurrent(): Promise<void> {
    const user = await this.auth.currentUser();
    if (user) this.identify(user);
  }

  private identify(user: AppUser): void {
    if (this.identifiedUserId && this.identifiedUserId !== user.id) this.analytics.reset();
    this.analytics.identify(user.id);
    this.identifiedUserId = user.id;
  }
}
