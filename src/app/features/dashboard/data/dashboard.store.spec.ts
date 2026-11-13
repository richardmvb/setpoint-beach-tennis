import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardActivity, dashboardInsights, dashboardMetrics } from '../../../testing/dashboard-data';
import { dashboardFakes } from '../dashboard.fakes';
import { DashboardStore } from './dashboard.store';

async function setup(options: { signedIn?: boolean; data?: boolean } = {}) {
  const fakes = await dashboardFakes({ signedIn: options.signedIn });
  if (options.data !== false) {
    fakes.dashboard.givenMetrics(dashboardMetrics());
    fakes.dashboard.givenActivity(dashboardActivity());
    fakes.dashboard.givenInsights(dashboardInsights());
  }
  TestBed.configureTestingModule({ providers: [DashboardStore, ...fakes.providers] });
  const store = TestBed.inject(DashboardStore);
  await vi.advanceTimersByTimeAsync(0);
  return { ...fakes, store };
}

describe('DashboardStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('without a session shows the sign-in and reads nothing', async () => {
    const { store, dashboard } = await setup();
    expect(store.authenticated()).toBe(false);
    expect(store.metrics()).toBeNull();
    expect(dashboard.insightReads).toEqual([]);
    expect(store.versionLabel).toBe('v7');
    expect(store.basePath).toBe('/setpoint-beach-tennis');
  });

  it('with a session loads the numbers, the lists and the insights of 30 days', async () => {
    const { store, dashboard, clock } = await setup({ signedIn: true });
    expect(store.authenticated()).toBe(true);
    expect(store.metrics()?.tournaments_active).toBe(3);
    expect(store.activity()?.active_tournaments).toHaveLength(1);
    expect(dashboard.insightReads).toEqual([30]);
    expect(store.view()?.mixes).toHaveLength(4);
    expect(store.insightsMissing()).toBe(false);
    expect(store.updatedAt()?.getTime()).toBe(clock.now());
    expect(store.loading()).toBe(false);
  });

  it('a sign-in reported later loads, and signing out clears the numbers', async () => {
    const { store, auth } = await setup();
    await auth.signInAnonymously();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.authenticated()).toBe(true);
    expect(store.metrics()).not.toBeNull();

    auth.simulateSignOut();
    expect(store.authenticated()).toBe(false);
    expect(store.metrics()).toBeNull();
    expect(store.activity()).toBeNull();
  });

  it('an account without access says so', async () => {
    const { store } = await setup({ signedIn: true, data: false });
    expect(store.error()).toEqual({ key: 'unauthorized' });
    expect(store.metrics()).toBeNull();
  });

  it('hides the new panels when the database has no insights yet', async () => {
    const fakes = await dashboardFakes({ signedIn: true });
    fakes.dashboard.givenMetrics(dashboardMetrics());
    fakes.dashboard.givenActivity(dashboardActivity());
    fakes.dashboard.givenInsights(null);
    TestBed.configureTestingModule({ providers: [DashboardStore, ...fakes.providers] });
    const store = TestBed.inject(DashboardStore);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.insightsMissing()).toBe(true);
    expect(store.view()).toBeNull();
    expect(store.metrics()).not.toBeNull();
  });

  it('another period reloads only the insights; the same period does nothing', async () => {
    const { store, dashboard } = await setup({ signedIn: true });
    await store.setDays(7);
    expect(store.days()).toBe(7);
    expect(dashboard.insightReads).toEqual([30, 7]);
    await store.setDays(7);
    expect(dashboard.insightReads).toEqual([30, 7]);
  });

  it('refresh reads everything again', async () => {
    const { store, dashboard } = await setup({ signedIn: true });
    dashboard.givenMetrics(dashboardMetrics({ tournaments_active: 9 }));
    await store.load();
    expect(store.metrics()?.tournaments_active).toBe(9);
  });

  it('filters the list by mode and search, with each tournament linked to the admin viewer', async () => {
    const { store } = await setup({ signedIn: true });
    expect(store.visibleTournaments().map((item) => item.viewerUrl)).toEqual([
      'https://example.test/setpoint-beach-tennis/?dashboardTournament=t1&source=shared',
    ]);
    store.listMode.set('archived');
    expect(store.visibleTournaments().map((item) => item.id)).toEqual(['a1']);
    store.search.set('nada');
    expect(store.visibleTournaments()).toEqual([]);
    expect(store.stagesTotal()).toBe(12);
    expect(store.dropoff()?.id).toBe('underHalf');
  });

  describe('sign-in link', () => {
    it('sends the link to the e-mail, returning to /dashboard', async () => {
      const { store, auth } = await setup();
      store.email.set('  admin@example.com ');
      await store.requestMagicLink();
      expect(auth.loginRequests).toEqual([
        { email: 'admin@example.com', redirectTo: 'https://example.test/setpoint-beach-tennis/dashboard' },
      ]);
      expect(store.magicLinkSent()).toBe(true);
      expect(store.loading()).toBe(false);
    });

    it('does nothing without an e-mail', async () => {
      const { store, auth } = await setup();
      store.email.set('  ');
      await store.requestMagicLink();
      expect(auth.loginRequests).toEqual([]);
    });

    it("shows the auth service's message when the link cannot be sent", async () => {
      const { store, auth } = await setup();
      auth.requestModeratorLogin = () => Promise.reject(new Error('Email rate limit exceeded'));
      store.email.set('admin@example.com');
      await store.requestMagicLink();
      expect(store.error()).toEqual({ key: 'sendFailed', detail: 'Email rate limit exceeded' });
      expect(store.magicLinkSent()).toBe(false);
      auth.requestModeratorLogin = () => Promise.reject(new Error(''));
      await store.requestMagicLink();
      expect(store.error()).toEqual({ key: 'sendFailed' });
    });
  });

  it('does not load when the page is gone before the session check answers', async () => {
    const fakes = await dashboardFakes({ signedIn: true });
    fakes.dashboard.givenMetrics(dashboardMetrics());
    fakes.dashboard.givenActivity(dashboardActivity());
    TestBed.configureTestingModule({ providers: [DashboardStore, ...fakes.providers] });
    TestBed.inject(DashboardStore);
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakes.dashboard.insightReads).toEqual([]);
  });

  it('stops listening to sign-in changes when the page goes away', async () => {
    const { auth, dashboard } = await setup();
    TestBed.resetTestingModule();
    await auth.signInAnonymously();
    await vi.advanceTimersByTimeAsync(0);
    expect(dashboard.insightReads).toEqual([]);
  });
});
