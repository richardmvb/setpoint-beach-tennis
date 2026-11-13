import { InjectionToken } from '@angular/core';

/** Settings the deploy provides at runtime (not at build time), with defaults applied. */
export interface AppConfig {
  /** Identifies the build; `dev` when the deploy does not set one. */
  readonly buildId: string;
  readonly buildVersion?: number;
  readonly production: boolean;
  /** When true the app asks for the access code before opening. */
  readonly lockScreenEnabled: boolean;
  readonly posthogKey?: string;
  readonly posthogHost?: string;
  readonly supabaseUrl?: string;
  readonly publishableKey?: string;
}
export const APP_CONFIG = new InjectionToken<AppConfig>('AppConfig');
