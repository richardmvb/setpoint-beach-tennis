import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, isDevMode, PLATFORM_ID } from '@angular/core';
import posthog from 'posthog-js';
import { APP_CONFIG } from '../../ports/app-config.port';

export interface PostHogSettings {
  apiKey?: string;
  apiHost?: string;
  production: boolean;
}

/** The SDK instance. Provided by default from `posthog-js`; tests replace it with a fake. */
export const POSTHOG_SDK = new InjectionToken<typeof posthog>('PostHogSdk', {
  providedIn: 'root',
  factory: () => posthog,
});

export const POSTHOG_SETTINGS = new InjectionToken<PostHogSettings>('PostHogSettings', {
  providedIn: 'root',
  factory: () => {
    const config = inject(APP_CONFIG);
    return { apiKey: config.posthogKey, apiHost: config.posthogHost, production: config.production };
  },
});

/**
 * Owns the PostHog SDK: whether it is running and how it is configured. The three adapters
 * (analytics, errors, surveys) share it, so the SDK is initialized once and nothing outside
 * this folder sees it.
 */
@Injectable({ providedIn: 'root' })
export class PostHogClient {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly posthog = inject(POSTHOG_SDK);
  private readonly settings = inject(POSTHOG_SETTINGS);
  private running = false;

  get isRunning(): boolean {
    return this.browser && this.running;
  }

  /** The SDK when it is running, otherwise null. */
  get sdk(): typeof posthog | null {
    return this.isRunning ? this.posthog : null;
  }

  start(): void {
    if (!this.browser || this.running) return;
    const { apiKey, apiHost, production } = this.settings;
    if (!apiKey || !apiHost) {
      if (isDevMode()) {
        const variableName = apiKey ? 'NG_APP_POSTHOG_HOST' : 'NG_APP_POSTHOG_PROJECT_TOKEN';
        console.warn(`${variableName} is not configured; PostHog analytics are disabled in this local session.`);
      }
      return;
    }
    this.posthog.init(apiKey, {
      api_host: apiHost,
      capture_exceptions: true,
      disable_capture_url_hashes: true,
      // O token do convite fica em ?invite= na URL; o PostHog envia <masked> no lugar dele.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['invite'],
      logs: {
        serviceName: 'setpoint-web',
        environment: production ? 'production' : 'development',
      },
    });
    this.running = true;
  }
}
