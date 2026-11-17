import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shellFakes } from '../../testing/shell-fakes';
import { storedTournament } from '../../testing/tournament-state';
import { CurrentTournament } from '../current-tournament';
import type { TournamentState } from '../models';
import { SavedTournaments } from '../saved-tournaments';
import { TournamentArchive } from './tournament-archive';

const running = () => ({ ...storedTournament(), hostingMode: 'local' as const, analyticsId: 'a1' });

function setup(options: Parameters<typeof shellFakes>[0] = {}, state: TournamentState = running()) {
  const fakes = shellFakes(options);
  TestBed.configureTestingModule({ providers: fakes.providers });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(state);
  return {
    ...fakes,
    cloud: fakes.archive,
    tournament,
    archive: TestBed.inject(TournamentArchive),
    saved: TestBed.inject(SavedTournaments),
  };
}

beforeEach(() => TestBed.resetTestingModule());

describe('keeping a tournament in "Meus torneios"', () => {
  it('saves the tournament in use, once, and refreshes the list', () => {
    const { archive, saved } = setup();
    archive.archiveCurrent();
    expect(saved.entries()).toHaveLength(1);
    expect(saved.entries()[0].id).toBe('a1');
  });

  it('gives a local tournament with a schedule an analytics id first', () => {
    const { archive, tournament, saved } = setup({}, { ...running(), analyticsId: undefined });
    archive.keep(tournament.state());
    expect(tournament.state().analyticsId).toBeTruthy();
    expect(saved.library.list()).toHaveLength(1);
  });

  it('gives another tournament an id without touching the one in use', () => {
    const { archive, tournament, saved } = setup();
    archive.keep({ ...running(), analyticsId: undefined, name: 'Outro' });
    expect(tournament.state().analyticsId).toBe('a1');
    expect(saved.library.list()[0].name).toBe('Outro');
  });

  it('marks a copy that is already on the server as uploaded', () => {
    const { archive, tournament, saved } = setup();
    archive.keep(tournament.state(), true);
    expect(saved.library.pendingArchives()).toEqual([]);
  });

  it('never throws: the library must not break scoring', () => {
    const { archive, tournament, local } = setup();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => archive.keep(tournament.state())).not.toThrow();
  });

  it('does nothing on the dashboard', () => {
    const { archive, saved } = setup({ dashboard: true });
    archive.archiveCurrent();
    expect(saved.library.list()).toEqual([]);
  });
});

describe('uploading', () => {
  it('uploads every unsent entry in order, with the live link it knows', async () => {
    const { archive, saved, ...fakes } = setup();
    fakes.local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'live-1', readToken: 'r', writeToken: 'w' }));
    archive.keep(running());
    await archive.flush();
    expect(fakes.cloud.saveLocalTournamentArchive).toHaveBeenCalledOnce();
    expect(fakes.cloud.saveLocalTournamentArchive.mock.calls[0][0]).toBe('a1');
    expect(saved.library.pendingArchives()).toEqual([]);
  });

  it('backs off for a minute after a failure, and keeps the data', async () => {
    const { archive, saved, clock, ...fakes } = setup();
    archive.keep(running());
    fakes.cloud.saveLocalTournamentArchive.mockRejectedValueOnce(new Error('down'));
    await archive.flush();
    expect(saved.library.pendingArchives()).toHaveLength(1);
    await archive.flush();
    expect(fakes.cloud.saveLocalTournamentArchive).toHaveBeenCalledTimes(1);
    clock.advance(60_000);
    await archive.flush();
    expect(fakes.cloud.saveLocalTournamentArchive).toHaveBeenCalledTimes(2);
    expect(saved.library.pendingArchives()).toEqual([]);
  });

  it.each([
    ['offline', { online: false }],
    ['without a backend', { configured: false }],
    ['in a shared view', { sharedView: true }],
    ['on the dashboard', { dashboard: true }],
  ] as const)('does not upload %s', async (_name, options) => {
    const { archive, ...fakes } = setup(options);
    archive.keep(running());
    await archive.flush();
    expect(fakes.cloud.saveLocalTournamentArchive).not.toHaveBeenCalled();
  });

  it('sends the entry again once its live link is created (requeue)', async () => {
    const { archive, saved, ...fakes } = setup();
    archive.keep(running());
    await archive.flush();
    expect(saved.library.pendingArchives()).toEqual([]);
    archive.requeue('a1');
    expect(saved.library.pendingArchives()).toHaveLength(1);
    await archive.flush();
    expect(fakes.cloud.saveLocalTournamentArchive).toHaveBeenCalledTimes(2);
  });
});

describe('usage metrics', () => {
  it('reports a started local tournament, and when it was abandoned', () => {
    const { archive, ...fakes } = setup();
    archive.recordMetrics();
    archive.recordMetrics(true);
    expect(fakes.cloud.recordLocalTournamentMetrics.mock.calls.map((call) => call[1])).toEqual([false, true]);
  });

  it('does not report a shared tournament or one that has not started', () => {
    const shared = setup({}, { ...running(), hostingMode: 'shared' });
    shared.archive.recordMetrics();
    expect(shared.cloud.recordLocalTournamentMetrics).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const idle = setup({}, { ...running(), startedAt: undefined });
    idle.archive.recordMetrics();
    expect(idle.cloud.recordLocalTournamentMetrics).not.toHaveBeenCalled();
  });

  it('ignores a failure to report', () => {
    const { archive, ...fakes } = setup();
    fakes.cloud.recordLocalTournamentMetrics.mockRejectedValueOnce(new Error('down'));
    expect(() => archive.recordMetrics()).not.toThrow();
  });

  it('backfills a tournament started before the metrics existed, after saving it', () => {
    const { archive, tournament, local, ...fakes } = setup({}, { ...running(), analyticsId: undefined });
    archive.backfillMetrics();
    expect(tournament.state().analyticsId).toBeTruthy();
    expect(local.getItem('setpoint.tournament.v1')).not.toBeNull();
    expect(fakes.cloud.recordLocalTournamentMetrics).toHaveBeenCalledOnce();
  });

  it('does not backfill when the device cannot save it', () => {
    const { archive, local, ...fakes } = setup();
    vi.spyOn(local, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    archive.backfillMetrics();
    expect(fakes.cloud.recordLocalTournamentMetrics).not.toHaveBeenCalled();
  });
});
