import type { AnalyticsPort, AnalyticsProps, ErrorReporter, SurveyPort } from '../analytics.port';

export type AnalyticsCall =
  | { kind: 'capture'; event: string; properties?: AnalyticsProps }
  | { kind: 'identify'; userId: string }
  | { kind: 'reset' };

/** In-memory analytics for tests: records calls once started, ignores them before, like the real adapter. */
export class FakeAnalytics implements AnalyticsPort {
  readonly calls: AnalyticsCall[] = [];
  readonly logs: string[] = [];
  private started = false;

  start(): void {
    this.started = true;
  }
  capture(event: string, properties?: AnalyticsProps): void {
    if (this.started) this.calls.push({ kind: 'capture', event, properties });
  }
  identify(userId: string): void {
    if (this.started) this.calls.push({ kind: 'identify', userId });
  }
  reset(): void {
    if (this.started) this.calls.push({ kind: 'reset' });
  }
  logInfo(message: string): void {
    if (this.started) this.logs.push(message);
  }
}

export class FakeErrorReporter implements ErrorReporter {
  readonly reported: (Error | string)[] = [];
  report(error: Error | string): void {
    this.reported.push(error);
  }
}

export class FakeSurveys implements SurveyPort {
  available = false;
  readonly shown: string[] = [];
  showByName(name: string): Promise<boolean> {
    if (!this.available) return Promise.resolve(false);
    this.shown.push(name);
    return Promise.resolve(true);
  }
}
