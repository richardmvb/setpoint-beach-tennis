import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AUTH, AuthChange } from '../../ports/auth.port';
import { authContract } from '../../ports/testing/auth.contract';
import { provideSupabaseAdapters } from './provide-supabase-adapters';
import { AppSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

interface FakeSession {
  user: { id: string; email?: string; app_metadata: object };
}

/** A stand-in for the parts of supabase-js auth the adapter uses. */
function fakeClient() {
  let session: FakeSession | null = null;
  const listeners = new Set<(event: string, session: FakeSession | null) => void>();
  const auth = {
    getUser: () =>
      Promise.resolve(
        session
          ? { data: { user: session.user }, error: null }
          : { data: { user: null }, error: new Error('no session') },
      ),
    signInAnonymously: () => {
      session = { user: { id: 'u-1', email: 'secret@example.com', app_metadata: { provider: 'anonymous' } } };
      for (const listener of listeners) listener('SIGNED_IN', session);
      return Promise.resolve({ error: null });
    },
    signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
    initialize: vi.fn(() => Promise.resolve()),
    onAuthStateChange: (listener: (event: string, session: FakeSession | null) => void) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
  };
  return { client: { auth } as unknown as AppSupabaseClient, auth };
}

function setup(client: AppSupabaseClient | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideSupabaseAdapters(), { provide: SUPABASE_CLIENT, useValue: client }],
  });
  return TestBed.inject(AUTH);
}

authContract('SupabaseAuth', () => setup(fakeClient().client));

describe('SupabaseAuth', () => {
  it('maps vendor events to app changes', async () => {
    const { client, auth } = fakeClient();
    const port = setup(client);
    const heard: AuthChange[] = [];
    port.onAuthStateChange((change) => heard.push(change));
    await port.signInAnonymously();
    expect(heard).toEqual(['signed-in']);
    expect(auth.getUser).toBeDefined();
  });

  it('asks Supabase to send the email link with the redirect', async () => {
    const { client, auth } = fakeClient();
    await setup(client).requestModeratorLogin('a@b.c', 'https://app/dashboard');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.c',
      options: { emailRedirectTo: 'https://app/dashboard' },
    });
  });

  it('reports not configured and does nothing when the deploy has no Supabase settings', async () => {
    const port = setup(null);
    expect(port.configured).toBe(false);
    expect(await port.currentUser()).toBeNull();
    const stop = port.onAuthStateChange(() => undefined);
    expect(stop).toBeTypeOf('function');
    await expect(port.signInAnonymously()).rejects.toThrow('não está configurado');
  });

  it('removes sign-in tokens from the URL hash after finishing', async () => {
    const { client } = fakeClient();
    const port = setup(client);
    window.history.replaceState(null, '', '/?x=1#access_token=abc');
    await port.finishUrlSignIn();
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?x=1');
  });
});
