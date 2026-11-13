import { inject, Injectable, Provider } from '@angular/core';
import {
  ANALYTICS,
  AnalyticsPort,
  AnalyticsProps,
  ERROR_REPORTER,
  ErrorReporter,
  SURVEYS,
  SurveyPort,
} from '../../ports/analytics.port';
import { PostHogClient } from './posthog-client';

@Injectable({ providedIn: 'root' })
class PostHogAnalytics implements AnalyticsPort {
  private readonly client = inject(PostHogClient);

  start(): void {
    this.client.start();
  }
  capture(event: string, properties?: AnalyticsProps): void {
    this.client.sdk?.capture(event, properties);
  }
  identify(userId: string): void {
    this.client.sdk?.identify(userId);
  }
  reset(): void {
    this.client.sdk?.reset();
  }
  logInfo(message: string, attributes: Readonly<Record<string, string | number | boolean | undefined>>): void {
    this.client.sdk?.logger.info(message, { ...attributes });
  }
}

@Injectable({ providedIn: 'root' })
class PostHogErrorReporter implements ErrorReporter {
  private readonly client = inject(PostHogClient);

  report(error: Error | string): void {
    this.client.sdk?.captureException(error);
  }
}

@Injectable({ providedIn: 'root' })
class PostHogSurveys implements SurveyPort {
  private readonly client = inject(PostHogClient);

  get available(): boolean {
    return this.client.isRunning;
  }

  showByName(name: string, centered = false): Promise<boolean> {
    const sdk = this.client.sdk;
    if (!sdk) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        settled = true;
        resolve(false);
      }, 10000);
      sdk.getSurveys((surveys) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        const survey = surveys.find((item) => item.name === name && item.type === 'api');
        if (!survey) {
          resolve(false);
          return;
        }

        try {
          sdk.displaySurvey(survey.id, {
            displayType: 'popover',
            ignoreConditions: true,
            ignoreDelay: true,
            position: centered ? 'center' : 'next_to_trigger',
            ...(centered ? {} : { selector: '.footer-feedback' }),
          });
          resolve(true);
        } catch {
          resolve(false);
        }
      }, true);
    });
  }
}

/** Binds the analytics, error and survey ports to PostHog. The only place that names this vendor for them. */
export function providePostHogAdapters(): Provider[] {
  return [
    { provide: ANALYTICS, useExisting: PostHogAnalytics },
    { provide: ERROR_REPORTER, useExisting: PostHogErrorReporter },
    { provide: SURVEYS, useExisting: PostHogSurveys },
  ];
}
