import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NpsFeedbackService } from './nps-feedback.service';
import { ANALYTICS, SURVEYS } from './ports/analytics.port';
import { FakeAnalytics, FakeSurveys } from './ports/testing/analytics.fake';

function setup(surveys: FakeSurveys = new FakeSurveys()) {
  const analytics = new FakeAnalytics();
  analytics.start();
  TestBed.configureTestingModule({
    providers: [
      { provide: SURVEYS, useValue: surveys },
      { provide: ANALYTICS, useValue: analytics },
    ],
  });
  return { service: TestBed.inject(NpsFeedbackService), analytics, surveys };
}

describe('NpsFeedbackService', () => {
  it('shows the NPS survey and records that it opened', async () => {
    const surveys = new FakeSurveys();
    surveys.available = true;
    const { service, analytics } = setup(surveys);
    expect(service.available).toBe(true);
    await service.open(true);
    expect(surveys.shown).toEqual(['Net promoter score (NPS) (2026-11-01 20:44)']);
    expect(analytics.calls).toEqual([{ kind: 'capture', event: 'nps_feedback_opened', properties: { survey: 'nps' } }]);
    expect(service.message()).toBe('');
    expect(service.loading()).toBe(false);
  });

  it('says the survey is unavailable when it cannot be shown', async () => {
    const { service, analytics } = setup();
    await service.open();
    expect(service.message()).toBe('unavailable');
    expect(analytics.calls).toEqual([]);
  });

  it('says it failed when the survey service throws', async () => {
    const surveys = new FakeSurveys();
    surveys.showByName = () => Promise.reject(new Error('down'));
    const { service } = setup(surveys);
    await service.open();
    expect(service.message()).toBe('failed');
    expect(service.loading()).toBe(false);
  });

  it('ignores a second open while the first is loading', () => {
    const surveys = new FakeSurveys();
    let calls = 0;
    surveys.showByName = () => {
      calls++;
      return new Promise<boolean>(() => undefined);
    };
    const { service } = setup(surveys);
    void service.open();
    void service.open();
    expect(calls).toBe(1);
  });
});
