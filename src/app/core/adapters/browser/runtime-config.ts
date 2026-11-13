import type { AppConfig } from '../../ports/app-config.port';

/** Reads `public/runtime-config.js` (`window.__SETPOINT_CONFIG__`), applying the defaults for anything missing. */
export function readRuntimeConfig(): AppConfig {
  const config = window.__SETPOINT_CONFIG__;
  return {
    buildId: config?.buildId || 'dev',
    buildVersion: config?.buildVersion,
    production: config?.production ?? false,
    lockScreenEnabled: config?.lockScreenEnabled ?? false,
    routerEnabled: config?.routerEnabled ?? false,
    posthogKey: config?.posthogKey,
    posthogHost: config?.posthogHost,
    supabaseUrl: config?.supabaseUrl,
    publishableKey: config?.publishableKey,
  };
}
