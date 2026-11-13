import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { provideBrowserAdapters } from './core/adapters/browser/provide-browser-adapters';
import { providePostHogAdapters } from './core/adapters/posthog/posthog-adapters';
import { provideSupabaseAdapters } from './core/adapters/supabase/provide-supabase-adapters';
import { provideAppErrorHandler } from './core/app-error-handler';
import { provideI18n } from './core/i18n/provide-i18n';

/**
 * Composition root: the only place that decides which implementation serves each capability
 * (docs/adr/0003-ports-and-adapters.md). Vendor providers are added here as they move behind ports. How the address
 * is handled (the original code or the router) is chosen by main.ts from the `routerEnabled` flag and passed in.
 */
export function buildAppConfig(urlProviders: ApplicationConfig['providers']): ApplicationConfig {
  return {
    providers: [
      provideZoneChangeDetection(),
      provideBrowserAdapters(),
      providePostHogAdapters(),
      provideSupabaseAdapters(),
      provideAppErrorHandler(),
      provideI18n(),
      ...urlProviders,
    ],
  };
}
