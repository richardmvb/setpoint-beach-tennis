import { afterEach, describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime-config';

describe('readRuntimeConfig', () => {
  afterEach(() => {
    delete window.__SETPOINT_CONFIG__;
  });

  it('uses safe defaults when the deploy provides no config', () => {
    delete window.__SETPOINT_CONFIG__;
    expect(readRuntimeConfig()).toEqual({
      buildId: 'dev',
      buildVersion: undefined,
      production: false,
      lockScreenEnabled: false,
      routerEnabled: false,
      posthogKey: undefined,
      posthogHost: undefined,
      supabaseUrl: undefined,
      publishableKey: undefined,
    });
  });

  it('maps every setting the deploy provides', () => {
    window.__SETPOINT_CONFIG__ = {
      buildId: 'abc123',
      buildVersion: 7,
      production: true,
      lockScreenEnabled: true,
      routerEnabled: true,
      posthogKey: 'ph-key',
      posthogHost: 'https://eu.i.posthog.com',
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'sb-key',
    };
    expect(readRuntimeConfig()).toMatchObject({
      buildId: 'abc123',
      buildVersion: 7,
      production: true,
      lockScreenEnabled: true,
      routerEnabled: true,
      posthogKey: 'ph-key',
      posthogHost: 'https://eu.i.posthog.com',
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'sb-key',
    });
  });

  it('treats an empty build id as the dev build', () => {
    window.__SETPOINT_CONFIG__ = { buildId: '' };
    expect(readRuntimeConfig().buildId).toBe('dev');
  });

  it('reads the config again on every call, so it follows what the page has now', () => {
    window.__SETPOINT_CONFIG__ = { buildId: 'one' };
    expect(readRuntimeConfig().buildId).toBe('one');
    window.__SETPOINT_CONFIG__ = { buildId: 'two' };
    expect(readRuntimeConfig().buildId).toBe('two');
  });
});
