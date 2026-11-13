import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { providePostHogAdapters } from './core/adapters/posthog/posthog-adapters';
import { provideSupabaseAdapters } from './core/adapters/supabase/provide-supabase-adapters';
import { provideAppErrorHandler } from './core/app-error-handler';

/**
 * Composition root: the only place that decides which implementation serves each capability
 * (docs/adr/0003-ports-and-adapters.md). Vendor providers are added here as they move behind ports.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    providePostHogAdapters(),
    provideSupabaseAdapters(),
    provideAppErrorHandler(),
  ],
};
