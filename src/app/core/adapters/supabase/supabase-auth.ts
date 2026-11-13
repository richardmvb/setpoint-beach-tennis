import { inject, Injectable } from '@angular/core';
import { AppUser, AuthChange, AuthPort } from '../../ports/auth.port';
import { requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SupabaseAuth implements AuthPort {
  private readonly client = inject(SUPABASE_CLIENT);

  get configured(): boolean {
    return this.client !== null;
  }

  async finishUrlSignIn(): Promise<void> {
    try {
      await this.client?.auth.initialize();
    } finally {
      if (window.location.hash)
        history.replaceState(history.state, '', window.location.pathname + window.location.search);
    }
  }

  async currentUser(): Promise<AppUser | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user ? { id: data.user.id } : null;
  }

  onAuthStateChange(callback: (change: AuthChange, user: AppUser | null) => void): () => void {
    if (!this.client) return () => undefined;
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      const change: AuthChange = event === 'SIGNED_IN' ? 'signed-in' : event === 'SIGNED_OUT' ? 'signed-out' : 'other';
      callback(change, session?.user ? { id: session.user.id } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestModeratorLogin(email: string, redirectTo: string): Promise<void> {
    const { error } = await requireSupabaseClient(this.client).auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }

  async signInAnonymously(): Promise<void> {
    const { error } = await requireSupabaseClient(this.client).auth.signInAnonymously();
    if (error) throw error;
  }
}
