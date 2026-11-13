import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG, AppConfig } from '../../ports/app-config.port';
import { testConfig } from '../../ports/testing/app-config.fake';
import { requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

function clientFor(overrides: Partial<AppConfig>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: APP_CONFIG, useValue: testConfig(overrides) }] });
  return TestBed.inject(SUPABASE_CLIENT);
}

describe('SUPABASE_CLIENT', () => {
  it('is null when the deploy has no Supabase settings', () => {
    expect(clientFor({})).toBeNull();
    expect(clientFor({ supabaseUrl: 'https://x.supabase.co' })).toBeNull();
    expect(clientFor({ publishableKey: 'key' })).toBeNull();
  });

  it('is built from the config when both settings are present', () => {
    expect(clientFor({ supabaseUrl: 'https://x.supabase.co', publishableKey: 'key' })).not.toBeNull();
  });

  it('accepts the REST url and a trailing slash, and uses the project url', () => {
    for (const url of ['https://x.supabase.co/rest/v1', 'https://x.supabase.co/rest/v1/', 'https://x.supabase.co/']) {
      const client = clientFor({ supabaseUrl: url, publishableKey: 'key' }) as unknown as { supabaseUrl: string };
      expect(client.supabaseUrl).toBe('https://x.supabase.co');
    }
  });
});

describe('requireSupabaseClient', () => {
  it('explains that the deploy has no backend when there is no client', () => {
    expect(() => requireSupabaseClient(null)).toThrow('não está configurado');
  });
});
