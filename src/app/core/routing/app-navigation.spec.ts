import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { shellFakes, capturedEvents } from '../../testing/shell-fakes';
import { storedTournament } from '../../testing/tournament-state';
import { CurrentTournament } from '../current-tournament';
import type { Page } from '../models';
import { AppNavigation } from './app-navigation';

function setup(options: Parameters<typeof shellFakes>[0] = {}) {
  const fakes = shellFakes(options);
  TestBed.configureTestingModule({ providers: fakes.providers });
  return { ...fakes, navigation: TestBed.inject(AppNavigation), tournament: TestBed.inject(CurrentTournament) };
}

beforeEach(() => TestBed.resetTestingModule());

describe('AppNavigation', () => {
  it('starts on setup, or on the dashboard when the address says so', () => {
    expect(setup().navigation.page()).toBe('setup');
    TestBed.resetTestingModule();
    expect(setup({ dashboard: true }).navigation.dashboardRoute()).toBe(true);
  });

  it('changes page, records the view and says which page it left', () => {
    const { navigation, analytics } = setup();
    const left: Page[] = [];
    navigation.left$.subscribe((page) => left.push(page));
    navigation.setPage('rounds');
    navigation.setPage('rounds');
    navigation.setPage('overview');
    expect(navigation.page()).toBe('overview');
    expect(left).toEqual(['setup', 'rounds']);
    expect(analytics.calls.filter((call) => call.kind === 'capture')).toHaveLength(2);
    expect(analytics.calls[0]).toMatchObject({ event: 'feature_viewed', properties: { feature: 'matches' } });
  });

  it('sets the first page without recording a view', () => {
    const { navigation, analytics } = setup();
    navigation.initialize('overview');
    expect(navigation.page()).toBe('overview');
    expect(capturedEvents(analytics)).toEqual([]);
  });

  it('takes the address to the dashboard and back home', () => {
    const { navigation, urlState } = setup();
    navigation.setPage('dashboard');
    expect(navigation.dashboardRoute()).toBe(true);
    expect(urlState.goToDashboard).toHaveBeenCalledOnce();
    navigation.setPage('dashboard');
    expect(urlState.goToDashboard).toHaveBeenCalledOnce();
    navigation.setPage('overview');
    expect(navigation.dashboardRoute()).toBe(false);
    expect(urlState.goHome).toHaveBeenCalledOnce();
  });

  it('follows the back button between home and the dashboard', () => {
    const fakes = shellFakes();
    let dashboard = false;
    fakes.urlState.snapshot = () => ({
      inviteToken: '',
      liveToken: '',
      dashboardViewerId: '',
      dashboardViewerSource: null,
      dashboardPath: dashboard,
      authCallback: false,
    });
    TestBed.configureTestingModule({ providers: fakes.providers });
    const navigation = TestBed.inject(AppNavigation);
    const tournament = TestBed.inject(CurrentTournament);
    tournament.set(storedTournament());
    expect(navigation.restoreFromPath()).toBe(false);
    dashboard = true;
    expect(navigation.restoreFromPath()).toBe(true);
    expect(navigation.page()).toBe('dashboard');
    dashboard = false;
    expect(navigation.restoreFromPath()).toBe(false);
    expect(navigation.page()).toBe('overview');
    tournament.update((state) => ({ ...state, rounds: [] }));
    dashboard = true;
    navigation.restoreFromPath();
    dashboard = false;
    navigation.restoreFromPath();
    expect(navigation.page()).toBe('setup');
  });
});
