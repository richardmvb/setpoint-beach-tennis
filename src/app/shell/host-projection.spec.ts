import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentTournament } from '../core/current-tournament';
import { AppNavigation } from '../core/routing/app-navigation';
import { ProjectionController } from '../features/tournament/projection/projection-controller';
import { ProjectionTarget } from '../features/tournament/projection/projection-target';
import { shellFakes } from '../testing/shell-fakes';
import { storedTournament } from '../testing/tournament-state';
import { provideHostProjection } from './host-projection';

@Component({ selector: 'app-host', template: '', providers: [provideHostProjection()] })
class HostComponent {
  readonly projection = inject(ProjectionController);
}

function setup() {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ providers: fakes.providers });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set({ ...storedTournament(), hostingMode: 'shared', qualificationStats: true });
  const fixture = TestBed.createComponent(HostComponent);
  return {
    ...fakes,
    tournament,
    projection: fixture.componentInstance.projection,
    target: TestBed.inject(ProjectionTarget),
    navigation: TestBed.inject(AppNavigation),
    fixture,
  };
}

beforeEach(() => TestBed.resetTestingModule());

describe('provideHostProjection', () => {
  it('projects the host: the leader until another athlete is picked, never a guest', () => {
    const { projection, target, tournament } = setup();
    expect(projection.isGuest).toBe(false);
    const leader = projection.playerId;
    expect(leader).toBe(tournament.state().players.find((player) => player.id === leader)?.id);
    target.set('p2');
    expect(projection.playerId).toBe('p2');
    target.set('');
    expect(projection.playerId).toBe(leader);
  });

  it('reads the tournament in use', () => {
    const { projection, tournament } = setup();
    expect(projection.configured).toBe(true);
    tournament.update((state) => ({ ...state, qualificationStats: false }));
    expect(projection.configured).toBe(false);
  });

  it('forgets the what-if results when the host leaves the projection page', () => {
    const { projection, navigation } = setup();
    navigation.initialize('projection');
    projection.toggleForced({ matchId: 'm1', side: 'A' });
    expect(projection.forced()).toEqual({ m1: 'A' });
    navigation.setPage('rounds');
    expect(projection.forced()).toEqual({});
  });

  it('keeps them when another page is left', () => {
    const { projection, navigation } = setup();
    navigation.initialize('rounds');
    projection.toggleForced({ matchId: 'm1', side: 'A' });
    navigation.setPage('overview');
    expect(projection.forced()).toEqual({ m1: 'A' });
  });

  it('sees whether the projection is on screen, so its news marker hides', () => {
    const { projection, navigation } = setup();
    const spy = vi.spyOn(projection, 'leave');
    navigation.initialize('projection');
    navigation.setPage('settings');
    expect(spy).toHaveBeenCalledOnce();
  });
});
