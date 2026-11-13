import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentState } from '../../../core/models';
import { PathCardService } from '../../../core/path-card.service';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { FakeAnalytics } from '../../../core/ports/testing/analytics.fake';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import { MemoryStorage } from '../../../testing/memory-storage';
import { storedTournament } from '../../../testing/tournament-state';
import { ProjectionController } from './projection-controller';

const stored = storedTournament();

/** The stored fixture as a shared tournament with the projection on; `roundOneDone` scores the last match of round 1. */
function sharedState(roundOneDone = true): TournamentState {
  const state = storedTournament();
  state.hostingMode = 'shared';
  state.qualificationStats = true;
  state.sharedTournamentId = 's1';
  if (roundOneDone) Object.assign(state.rounds[0].matches[1], { scoreA: 4, scoreB: 1 });
  return state;
}

function setup(options: { state?: TournamentState; guest?: string; render?: () => Promise<Blob> } = {}) {
  const analytics = new FakeAnalytics();
  analytics.start();
  const local = new MemoryStorage();
  TestBed.configureTestingModule({
    providers: [
      ProjectionController,
      { provide: ANALYTICS, useValue: analytics },
      { provide: LOCAL_STORE, useValue: local },
      { provide: PathCardService, useValue: { render: options.render ?? (() => Promise.resolve(new Blob(['png']))) } },
    ],
  });
  const memo = createStandingsMemo();
  const view = { state: options.state ?? sharedState(), viewing: false, host: '' };
  const projection = TestBed.inject(ProjectionController);
  projection.connect({
    state: () => view.state,
    standings: () => memo(view.state).all,
    playerId: () => options.guest ?? (view.host || memo(view.state).all[0]?.playerId || ''),
    isGuest: options.guest !== undefined,
    viewing: () => view.viewing,
  });
  const events = () => analytics.calls.map((call) => (call.kind === 'capture' ? call.event : call.kind));
  return { projection, analytics, local, view, events };
}

describe('ProjectionController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('needs a connected page', () => {
    TestBed.configureTestingModule({
      providers: [
        ProjectionController,
        { provide: LOCAL_STORE, useValue: new MemoryStorage() },
        { provide: ANALYTICS, useValue: new FakeAnalytics() },
      ],
    });
    expect(() => TestBed.inject(ProjectionController).available).toThrow(/connect/);
  });

  it('is configured for a shared tournament with the projection on; a guest also needs to be a player', () => {
    expect(setup().projection.configured).toBe(true);
    TestBed.resetTestingModule();
    expect(setup({ guest: '' }).projection.configured).toBe(false);
    TestBed.resetTestingModule();
    expect(setup({ guest: stored.players[0].id }).projection.configured).toBe(true);
  });

  it('stays locked until round 1 is done, and a tap shows the hint for a moment', () => {
    const { projection, events } = setup({ state: sharedState(false) });
    expect(projection.available).toBe(false);
    expect(projection.rows).toEqual([]);
    expect(projection.path).toBeNull();
    expect(projection.open()).toBe(false);
    expect(projection.hintVisible()).toBe(true);
    vi.advanceTimersByTime(3200);
    expect(projection.hintVisible()).toBe(false);
    expect(events()).toEqual([]);
  });

  it('opens once unlocked: records it, dismisses the tip, marks the rounds seen and loads the trend', () => {
    const { projection, local, analytics, view } = setup();
    expect(projection.available).toBe(true);
    expect(projection.showTip).toBe(true);
    expect(projection.hasNews).toBe(true);

    expect(projection.open()).toBe(true);
    view.viewing = true;

    const path = projection.path;
    expect(path?.playerId).toBe(projection.playerId);
    expect(analytics.calls[0]).toEqual({
      kind: 'capture',
      event: 'qualification_opened',
      properties: {
        is_guest: false,
        goal: 3,
        goal_status: path?.goals[3].status,
        calc_mode: path?.mode,
        open_matches: path?.openMatches,
      },
    });
    expect(projection.tipDismissed()).toBe(true);
    expect(local.getItem('setpoint.projection.seen.s1.host')).toBe('1');
    expect(projection.trend()).toEqual([]);
    vi.advanceTimersByTime(40);
    expect(projection.trend().length).toBeGreaterThan(0);

    view.viewing = false;
    expect(projection.hasNews).toBe(false);
    expect(projection.showTip).toBe(false);
  });

  it('keeps the seen marker per guest, under the same key as before', () => {
    const guest = stored.players[2].id;
    const { projection, local } = setup({ guest });
    projection.open();
    expect(local.getItem(`setpoint.projection.seen.s1.${guest}`)).toBe('1');
  });

  it('reads the seen marker a previous visit stored', () => {
    const { projection, local } = setup();
    local.setItem('setpoint.projection.seen.s1.host', '1');
    expect(projection.hasNews).toBe(false);
    expect(projection.showTip).toBe(false);
  });

  it('assumes and drops what-if results, and leaving clears them', () => {
    const { projection, events } = setup();
    projection.toggleForced({ matchId: 'm1', side: 'A' });
    projection.toggleForced({ matchId: 'm2', side: 'B' });
    expect(projection.forced()).toEqual({ m1: 'A', m2: 'B' });
    projection.toggleForced({ matchId: 'm1', side: 'A' });
    expect(projection.forced()).toEqual({ m2: 'B' });
    projection.clearForced();
    expect(projection.forced()).toEqual({});
    projection.toggleForced({ matchId: 'm3', side: 'A' });
    projection.leave();
    expect(projection.forced()).toEqual({});
    expect(events()).toEqual([
      'qualification_whatif_used',
      'qualification_whatif_used',
      'qualification_whatif_used',
      'qualification_whatif_cleared',
      'qualification_whatif_used',
    ]);
  });

  it('changing the athlete drops their what-if results and reloads the trend', () => {
    const { projection, view } = setup();
    projection.toggleForced({ matchId: 'm1', side: 'A' });
    view.host = stored.players[5].id;
    projection.playerChanged();
    expect(projection.forced()).toEqual({});
    vi.advanceTimersByTime(40);
    expect(projection.trend()[0]?.probability).toBeDefined();
  });

  it('changes the goal and records it', () => {
    const { projection, analytics } = setup();
    projection.setTargetPlace(1);
    expect(projection.targetPlace()).toBe(1);
    expect(analytics.calls).toEqual([
      { kind: 'capture', event: 'qualification_goal_changed', properties: { goal: 1 } },
    ]);
  });

  it("shows a guest's chance for the chosen goal, and nothing to the host", () => {
    const guest = setup({ guest: stored.players[0].id }).projection;
    expect(guest.currentGoal?.goal).toBe(3);
    expect(guest.chanceLabel).toMatch(/^(\d+%|<1%|>99%|✓|—)$/);
    TestBed.resetTestingModule();
    expect(setup().projection.chanceLabel).toBe('');
    TestBed.resetTestingModule();
    expect(setup({ guest: '' }).projection.currentGoal).toBeNull();
  });

  it('downloads the path image where files cannot be shared, and records it', async () => {
    URL.createObjectURL = () => 'blob:path';
    URL.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { projection, events } = setup();
    await projection.share();
    expect(click).toHaveBeenCalledTimes(1);
    expect(events()).toEqual(['qualification_path_shared']);
    expect(projection.sharing()).toBe(false);
    expect(projection.shareFailed()).toBe(false);
    click.mockRestore();
  });

  it('says the image failed, but not when the person cancelled the share sheet', async () => {
    const failing = setup({ render: () => Promise.reject(new Error('canvas')) }).projection;
    await failing.share();
    expect(failing.shareFailed()).toBe(true);
    TestBed.resetTestingModule();
    const cancelled = setup({ render: () => Promise.reject(new DOMException('cancel', 'AbortError')) }).projection;
    await cancelled.share();
    expect(cancelled.shareFailed()).toBe(false);
  });

  it('does not share while locked', async () => {
    const { projection, events } = setup({ state: sharedState(false) });
    await projection.share();
    expect(events()).toEqual([]);
  });
});
