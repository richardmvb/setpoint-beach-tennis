import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CurrentTournament } from '../core/current-tournament';
import { LocalLiveLink } from '../core/local-live-link';
import { ThemeService } from '../core/theme';
import { TournamentSync } from '../core/sync/tournament-sync';
import { shellFakes } from '../testing/shell-fakes';
import { storedTournament } from '../testing/tournament-state';
import { ShellState } from './shell-state';

function setup(linked = true) {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ providers: fakes.providers });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set({ ...storedTournament(), hostingMode: 'local', analyticsId: 'a1' });
  if (linked) {
    fakes.local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'l', readToken: 'r', writeToken: 'w' }));
    TestBed.inject(LocalLiveLink).restore(tournament.state());
  }
  return {
    ...fakes,
    state: TestBed.inject(ShellState),
    sync: TestBed.inject(TournamentSync),
    theme: TestBed.inject(ThemeService),
  };
}

beforeEach(() => TestBed.resetTestingModule());

describe('ShellState', () => {
  it('says the tournament is only on this device when it has no live link', () => {
    const { state } = setup(false);
    expect(state.tournament()).toMatchObject({ syncAvailable: false, syncStatus: 'device-only', syncError: null });
    expect(state.profile()).toEqual({ sync: 'device-only', syncWarning: false, syncError: null, theme: 'light' });
  });

  it('follows the sync: available, paused (a warning), failing, offline', () => {
    const { state, sync, connectivity } = setup();
    sync.initialize('local', 'a1', storedTournament());
    expect(state.tournament()).toMatchObject({ syncAvailable: true, syncStatus: 'synced', syncPaused: false });
    expect(state.profile().syncWarning).toBe(false);
    sync.setPaused(true);
    expect(state.tournament().syncStatus).toBe('paused');
    expect(state.profile()).toMatchObject({ sync: 'paused', syncWarning: true });
    sync.setPaused(false);
    sync.fail('conflict');
    expect(state.tournament()).toMatchObject({ syncStatus: 'error', syncError: 'conflict' });
    expect(state.profile()).toMatchObject({ syncWarning: true, syncError: 'conflict' });
    sync.clearError();
    connectivity.set(false);
    expect(state.tournament()).toMatchObject({ online: false, syncStatus: 'offline' });
    expect(state.profile().syncWarning).toBe(true);
  });

  it('follows the theme', () => {
    const { state, theme } = setup();
    theme.set('dark');
    expect(state.tournament().theme).toBe('dark');
    expect(state.profile().theme).toBe('dark');
  });

  it('keeps the same profile object when only a field it does not show changes', () => {
    const { state, sync } = setup();
    sync.initialize('local', 'a1', storedTournament());
    sync.fail('conflict');
    const profile = state.profile();
    const tournament = state.tournament();
    sync.setPaused(true);
    expect(state.tournament()).not.toBe(tournament);
    expect(state.profile()).toBe(profile);
  });
});
