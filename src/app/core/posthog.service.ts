import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, isDevMode, PLATFORM_ID } from '@angular/core';
import posthog, { PostHogConfig } from 'posthog-js';

@Injectable({ providedIn: 'root' })
export class PostHogService {
  private readonly platformId = inject(PLATFORM_ID);
  private initialized = false;

  get posthog(): typeof posthog {
    if (isPlatformBrowser(this.platformId) && this.initialized) {
      return posthog;
    }

    return new Proxy({} as typeof posthog, {
      get: () => () => undefined,
    });
  }
  get isInitialized(): boolean { return this.initialized; }

  displayApiSurveyByName(name: string, centered = false): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || !this.initialized) return Promise.resolve(false);

    return new Promise(resolve => {
      let settled = false;
      const timeout = window.setTimeout(() => { settled = true; resolve(false); }, 10000);
      posthog.getSurveys(surveys => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        const survey = surveys.find(item => item.name === name && item.type === 'api');
        if (!survey) {
          resolve(false);
          return;
        }

        try {
          posthog.displaySurvey(survey.id, {
            displayType: 'popover',
            ignoreConditions: true,
            ignoreDelay: true,
            position: centered ? 'center' : 'next_to_trigger',
            ...(centered ? {} : { selector: '.footer-feedback' })
          });
          resolve(true);
        } catch {
          resolve(false);
        }
      }, true);
    });
  }

  init(apiKey: string | undefined, options: Partial<PostHogConfig>): void {
    if (!isPlatformBrowser(this.platformId) || this.initialized) {
      return;
    }

    if (!apiKey || !options.api_host) {
      if (isDevMode()) {
        const variableName = apiKey
          ? 'NG_APP_POSTHOG_HOST'
          : 'NG_APP_POSTHOG_PROJECT_TOKEN';
        console.warn(`${variableName} is not configured; PostHog analytics are disabled in this local session.`);
      }
      return;
    }

    posthog.init(apiKey, options);
    this.initialized = true;
  }

  logInfo(message: string, attributes: Record<string, string | number | boolean | undefined>): void {
    if (isPlatformBrowser(this.platformId) && this.initialized) {
      posthog.logger.info(message, attributes);
    }
  }
}
