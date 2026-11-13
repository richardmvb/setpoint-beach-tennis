import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, isDevMode, PLATFORM_ID } from '@angular/core';
import posthog from 'posthog-js';
import { APP_CONFIG } from '../../ports/app-config.port';

export interface PostHogSettings {
  apiKey?: string;
  apiHost?: string;
  production: boolean;
  /** Sent with every event as `build_id` and `app_version`, so numbers (Web Vitals included) compare per release. */
  buildId: string;
  buildVersion?: number;
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
    return {
      apiKey: config.posthogKey,
      apiHost: config.posthogHost,
      production: config.production,
      buildId: config.buildId,
      buildVersion: config.buildVersion,
    };
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
    const { apiKey, apiHost, production, buildId, buildVersion } = this.settings;
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
      // Os tokens do convite (?invite=) e do link ao vivo (?live=) ficam na URL; o PostHog envia <masked> no lugar deles.
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['invite', 'live'],
      // Web Vitals (LCP, CLS, FCP, INP) de usuários reais, como eventos $web_vitals.
      capture_performance: { web_vitals: true },
      logs: {
        serviceName: 'setpoint-web',
        environment: production ? 'production' : 'development',
      },
    });
    this.posthog.register({
      app_version: buildVersion === undefined ? 'dev' : String(buildVersion),
      build_id: buildId,
    });
    this.running = true;
  }
}
