import { describe, expect, it } from 'vitest';
import { analyticsContract } from './analytics.contract';
import { FakeAnalytics, FakeSurveys } from './analytics.fake';

analyticsContract('FakeAnalytics', () => {
  const fake = new FakeAnalytics();
  return { port: fake, sent: () => fake.calls };
});

describe('FakeSurveys', () => {
  it('reports unavailable and shows nothing until it is made available', async () => {
    const surveys = new FakeSurveys();
    expect(await surveys.showByName('NPS')).toBe(false);
    surveys.available = true;
    expect(await surveys.showByName('NPS')).toBe(true);
    expect(surveys.shown).toEqual(['NPS']);
  });
});
