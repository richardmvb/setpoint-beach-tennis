import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { providePostHogErrorHandler } from './core/posthog-error-handler';

/**
 * Composition root: the only place that decides which implementation serves each capability
 * (docs/adr/0003-ports-and-adapters.md). Vendor providers are added here as they move behind ports.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection(), providePostHogErrorHandler()],
};
