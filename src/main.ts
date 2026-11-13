import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { buildAppConfig } from './app/app.config';
import { readRuntimeConfig } from './app/core/adapters/browser/runtime-config';
import { provideLegacyUrlState } from './app/core/routing/legacy-url-state';

/**
 * `routerEnabled` (a runtime flag, see docs/deploy.md) chooses how the address is handled. The router is a separate
 * chunk that is only fetched when the flag is on, so with it off the app is byte-for-byte what it was.
 */
async function start(): Promise<void> {
  const urlProviders = readRuntimeConfig().routerEnabled
    ? (await import('./app/core/routing/provide-router-url-state')).provideRouterUrlState()
    : provideLegacyUrlState();
  await bootstrapApplication(AppComponent, buildAppConfig(urlProviders));
}

start().catch((error: unknown) => console.error('Falha ao iniciar SETPOINT', error));
