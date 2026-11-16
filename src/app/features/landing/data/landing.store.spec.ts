import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { landingFakes } from '../landing.fakes';
import { landingSeen } from './landing-visit';
import { LandingStore } from './landing.store';

function setup(options: { buildVersion?: number } = {}) {
  const fakes = landingFakes(options);
  TestBed.configureTestingModule({ providers: [LandingStore, ...fakes.providers] });
  return { ...fakes, store: TestBed.inject(LandingStore) };
}

describe('LandingStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the build version, or dev when the deploy sets none', () => {
    expect(setup({ buildVersion: 12 }).store.versionLabel).toBe('v12');
    TestBed.resetTestingModule();
    expect(setup().store.versionLabel).toBe('dev');
  });

  it('start remembers the landing was seen and records the call to action', () => {
    const { store, local, analytics } = setup();
    store.start();
    expect(landingSeen(local)).toBe(true);
    expect(analytics.calls).toEqual([{ kind: 'capture', event: 'landing_cta_clicked', properties: undefined }]);
  });

  it('resume remembers the landing was seen and records the way to the saved tournaments', () => {
    const { store, local, analytics } = setup();
    store.resume();
    expect(landingSeen(local)).toBe(true);
    expect(analytics.calls).toEqual([{ kind: 'capture', event: 'landing_library_clicked', properties: undefined }]);
  });
});
