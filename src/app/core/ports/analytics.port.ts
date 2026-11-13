import { InjectionToken } from '@angular/core';

/** Event properties are enums, numbers and flags, never free text (docs/analytics.md, privacy rules). */
export type AnalyticsProps = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * Product analytics, written in the app's terms. Every method is a safe no-op until `start()` has run
 * (or when analytics is not configured), so callers never check whether analytics is on.
 */
export interface AnalyticsPort {
  /** Starts analytics when it is configured. Call once, after the URL has been cleaned of sign-in tokens. */
  start(): void;
  capture(event: string, properties?: AnalyticsProps): void;
  identify(userId: string): void;
  reset(): void;
  logInfo(message: string, attributes: Readonly<Record<string, string | number | boolean | undefined>>): void;
}
export const ANALYTICS = new InjectionToken<AnalyticsPort>('AnalyticsPort');

/** Reports unexpected errors to the error tracker. Never throws. */
export interface ErrorReporter {
  report(error: Error | string): void;
}
export const ERROR_REPORTER = new InjectionToken<ErrorReporter>('ErrorReporter');

/** In-app feedback survey. */
export interface SurveyPort {
  /** True when a survey can be shown (the analytics service is running). */
  readonly available: boolean;
  /** Shows the survey with this name. Resolves false when it does not exist or cannot be shown. */
  showByName(name: string, centered?: boolean): Promise<boolean>;
}
export const SURVEYS = new InjectionToken<SurveyPort>('SurveyPort');
