import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { provideBrowserAdapters } from './core/adapters/browser/provide-browser-adapters';
import { providePostHogAdapters } from './core/adapters/posthog/posthog-adapters';
import { provideSupabaseAdapters } from './core/adapters/supabase/provide-supabase-adapters';
import { provideAppErrorHandler } from './core/app-error-handler';
import { LegacyUrlState } from './core/routing/legacy-url-state';
import { URL_STATE } from './core/routing/url-state';

/**
 * Composition root: the only place that decides which implementation serves each capability
 * (docs/adr/0003-ports-and-adapters.md). Vendor providers are added here as they move behind ports.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideBrowserAdapters(),
    providePostHogAdapters(),
    provideSupabaseAdapters(),
    provideAppErrorHandler(),
    { provide: URL_STATE, useExisting: LegacyUrlState },
  ],
};
