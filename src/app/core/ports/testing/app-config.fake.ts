import type { AppConfig } from '../app-config.port';

/** A complete config for tests, with the overrides applied. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { buildId: 'test', production: false, lockScreenEnabled: false, routerEnabled: false, ...overrides };
}
