import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { tournamentState } from '../testing/tournament-state';
import { CurrentTournament } from './current-tournament';
import { ANALYTICS } from './ports/analytics.port';
import { CLOCK } from './ports/clock.port';
import { FakeAnalytics } from './ports/testing/analytics.fake';
import { FakeClock } from './ports/testing/clock.fake';
import { SetupProgress } from './setup-progress';

function setup() {
  const analytics = new FakeAnalytics();
  analytics.start();
  TestBed.configureTestingModule({
    providers: [
      { provide: ANALYTICS, useValue: analytics },
      { provide: CLOCK, useValue: new FakeClock() },
    ],
  });
  TestBed.inject(CurrentTournament).set(tournamentState({ tournamentMode: 'groups', size: 12, hostingMode: 'shared' }));
  return { progress: TestBed.inject(SetupProgress), analytics };
}

beforeEach(() => TestBed.resetTestingModule());

describe('SetupProgress', () => {
  it('starts on step 1 and moves silently with set', () => {
    const { progress, analytics } = setup();
    expect(progress.step()).toBe(1);
    progress.set(2);
    expect(progress.step()).toBe(2);
    expect(analytics.calls).toEqual([]);
  });

  it('records a step as viewed or completed with the format the tournament has', () => {
    const { progress, analytics } = setup();
    progress.show(2);
    progress.completed(1);
    const props = { hosting_mode: 'shared', tournament_mode: 'groups', doubles_format: 'open', tournament_size: 12 };
    expect(analytics.calls).toEqual([
      { kind: 'capture', event: 'tournament_setup_step_viewed', properties: { step: 2, ...props } },
      { kind: 'capture', event: 'tournament_setup_step_completed', properties: { step: 1, ...props } },
    ]);
    expect(progress.step()).toBe(2);
  });

  it('a revisit says where it came from and then views the step', () => {
    const { progress, analytics } = setup();
    progress.set(3);
    progress.revisit(1);
    expect(analytics.calls[0]).toEqual({
      kind: 'capture',
      event: 'tournament_setup_step_back',
      properties: { from: 3, to: 1 },
    });
    expect(analytics.calls[1]).toMatchObject({ event: 'tournament_setup_step_viewed', properties: { step: 1 } });
    expect(progress.step()).toBe(1);
  });
});
