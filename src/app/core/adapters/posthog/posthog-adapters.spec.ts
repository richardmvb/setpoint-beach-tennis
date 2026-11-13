import { TestBed } from '@angular/core/testing';
import type posthog from 'posthog-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS, ERROR_REPORTER, SURVEYS } from '../../ports/analytics.port';
import { analyticsContract } from '../../ports/testing/analytics.contract';
import type { AnalyticsCall } from '../../ports/testing/analytics.fake';
import { APP_CONFIG } from '../../ports/app-config.port';
import { testConfig } from '../../ports/testing/app-config.fake';
import { providePostHogAdapters } from './posthog-adapters';
import { POSTHOG_SDK, POSTHOG_SETTINGS, PostHogSettings } from './posthog-client';

type Sdk = typeof posthog;

/** A fake SDK that records the calls the adapter makes, in order. */
function fakeSdk() {
  const log: AnalyticsCall[] = [];
  const init = vi.fn();
  const register = vi.fn();
  const captureException = vi.fn();
  const getSurveys = vi.fn();
  const displaySurvey = vi.fn();
  const sdk = {
    init,
    register,
    capture: (event: string, properties?: Record<string, string>) =>
      log.push({ kind: 'capture', event, ...(properties === undefined ? {} : { properties }) }),
    identify: (userId: string) => log.push({ kind: 'identify', userId }),
    reset: () => log.push({ kind: 'reset' }),
    captureException,
    logger: { info: vi.fn() },
    getSurveys,
    displaySurvey,
  } as unknown as Sdk;
  return { sdk, log, init, register, captureException, getSurveys, displaySurvey };
}

const CONFIGURED: PostHogSettings = {
  apiKey: 'key',
  apiHost: 'https://eu.i.posthog.com',
  production: false,
  buildId: 'abc1234',
  buildVersion: 7,
};

function setup(settings: PostHogSettings = CONFIGURED) {
  TestBed.resetTestingModule();
  const sdk = fakeSdk();
  TestBed.configureTestingModule({
    providers: [
      providePostHogAdapters(),
      { provide: POSTHOG_SDK, useValue: sdk.sdk },
      { provide: POSTHOG_SETTINGS, useValue: settings },
    ],
  });
  return {
    sdk,
    analytics: TestBed.inject(ANALYTICS),
    reporter: TestBed.inject(ERROR_REPORTER),
    surveys: TestBed.inject(SURVEYS),
  };
}

analyticsContract('PostHogAnalytics', () => {
  const { analytics, sdk } = setup();
  return { port: analytics, sent: () => sdk.log };
});

describe('PostHog adapters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initializes the SDK once, with masking for the invite and live tokens and Web Vitals on', () => {
    const { analytics, sdk } = setup();
    analytics.start();
    analytics.start();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      'key',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        mask_personal_data_properties: true,
        custom_personal_data_properties: ['invite', 'live'],
        capture_performance: { web_vitals: true },
        disable_capture_url_hashes: true,
      }),
    );
  });

  it('registers the build as super properties after init', () => {
    const { analytics, sdk } = setup();
    analytics.start();
    expect(sdk.register).toHaveBeenCalledTimes(1);
    expect(sdk.register).toHaveBeenCalledWith({ app_version: '7', build_id: 'abc1234' });
  });

  it('registers app_version "dev" when there is no build version', () => {
    const { analytics, sdk } = setup({ ...CONFIGURED, buildVersion: undefined });
    analytics.start();
    expect(sdk.register).toHaveBeenCalledWith({ app_version: 'dev', build_id: 'abc1234' });
  });

  it('does not register anything when PostHog is not configured', () => {
    const { analytics, sdk } = setup({ production: false, buildId: 'abc1234' });
    analytics.start();
    expect(sdk.register).not.toHaveBeenCalled();
  });

  it('stays off, and every call is harmless, when the key or host is missing', () => {
    const { analytics, reporter, surveys, sdk } = setup({ production: false, buildId: 'abc1234' });
    analytics.start();
    analytics.capture('app_opened');
    reporter.report(new Error('boom'));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.log).toEqual([]);
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(surveys.available).toBe(false);
  });

  it('reports errors only after start, and surveys become available', () => {
    const { analytics, reporter, surveys, sdk } = setup();
    reporter.report('early');
    expect(sdk.captureException).not.toHaveBeenCalled();
    analytics.start();
    const error = new Error('boom');
    reporter.report(error);
    expect(sdk.captureException).toHaveBeenCalledWith(error);
    expect(surveys.available).toBe(true);
  });

  it('shows the survey with the given name and resolves false when it does not exist', async () => {
    const { analytics, surveys, sdk } = setup();
    analytics.start();
    sdk.getSurveys.mockImplementation((callback: (found: unknown[]) => void) =>
      callback([{ id: 's1', name: 'NPS', type: 'api' }]),
    );
    expect(await surveys.showByName('NPS', true)).toBe(true);
    expect(sdk.displaySurvey).toHaveBeenCalledWith('s1', expect.objectContaining({ position: 'center' }));
    expect(await surveys.showByName('Other')).toBe(false);
  });

  it('does not show a survey before start', async () => {
    const { surveys, sdk } = setup();
    expect(await surveys.showByName('NPS')).toBe(false);
    expect(sdk.getSurveys).not.toHaveBeenCalled();
  });

  it('reads its settings from the app config by default', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: testConfig({
            posthogKey: 'k',
            posthogHost: 'https://h',
            production: true,
            buildId: 'abc1234',
            buildVersion: 9,
          }),
        },
      ],
    });
    expect(TestBed.inject(POSTHOG_SETTINGS)).toEqual({
      apiKey: 'k',
      apiHost: 'https://h',
      production: true,
      buildId: 'abc1234',
      buildVersion: 9,
    });
  });
});
