import { afterEach, describe, expect, it, vi } from 'vitest';
import { tournamentState } from '../testing/tournament-state';
import { exportTournamentBackup } from './backup-export';
import { FakeAnalytics } from './ports/testing/analytics.fake';
import { FakeClock } from './ports/testing/clock.fake';

describe('exportTournamentBackup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the state as dated JSON and records the export', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = (blob: Blob) => {
      created.push(blob);
      return 'blob:backup';
    };
    URL.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('setpoint-2026-11-13.json');
      expect(this.href).toBe('blob:backup');
    });
    const analytics = new FakeAnalytics();
    analytics.start();
    const state = tournamentState({ tournamentMode: 'groups', finishedAt: '2026-11-13T12:00:00.000Z' });

    exportTournamentBackup(state, new FakeClock(), analytics);

    expect(click).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await created[0].text())).toEqual(state);
    expect(analytics.calls).toEqual([
      {
        kind: 'capture',
        event: 'backup_exported',
        properties: { tournament_mode: 'groups', tournament_size: 8, has_schedule: false, is_finalized: true },
      },
    ]);
  });
});
