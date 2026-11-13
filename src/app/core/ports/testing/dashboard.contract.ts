import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../../shared/parsers/error-message';
import { dashboardActivity, dashboardInsights, dashboardMetrics } from '../../../testing/dashboard-data';
import type { DashboardInsights } from '../../dashboard-insights';
import type { SharedTournamentSnapshot } from '../../models';
import type { DashboardActivity, DashboardMetrics, DashboardTournamentSource } from '../dashboard.port';
import type { DashboardViewerPort } from './dashboard.fake';

type TournamentCore = Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>;

export interface DashboardHarness {
  port: DashboardViewerPort;
  /** The server has this tournament under this source. */
  given: (source: DashboardTournamentSource, tournament: TournamentCore) => void;
  /** The server has these product numbers and activity lists. */
  givenData: (metrics: DashboardMetrics, activity: DashboardActivity) => void;
  /** The server's insights; `null` is a database without them (an older migration). */
  givenInsights: (insights: DashboardInsights | null) => void;
  /** The server refuses the next reads with this error code (for example `not_authorized`). */
  fail: (code: string) => void;
}

const tournament = (id: string, status: TournamentCore['status']): TournamentCore => ({
  id,
  status,
  state: {
    version: 1,
    name: `Torneio ${id}`,
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players: [],
    rounds: [],
    createdAt: '2026-11-13T10:00:00.000Z',
  },
});

/** What the admin viewer relies on from every DashboardRepository implementation. */
export function dashboardContract(name: string, create: () => DashboardHarness): void {
  describe(`DashboardRepository viewer contract: ${name}`, () => {
    for (const source of ['local', 'shared'] as const) {
      it(`reads a ${source} tournament by its id`, async () => {
        const { port, given } = create();
        given(source, tournament('t-1', 'active'));
        const read = await port.getDashboardTournament(source, 't-1');
        expect(read.id).toBe('t-1');
        expect(read.status).toBe('active');
        expect(read.state.name).toBe('Torneio t-1');
      });
    }

    it('reads the product numbers and the active and archived tournaments', async () => {
      const { port, givenData } = create();
      givenData(dashboardMetrics({ tournaments_total: 7 }), dashboardActivity());
      expect((await port.getDashboardMetrics()).tournaments_total).toBe(7);
      const activity = await port.getDashboardActivity();
      expect(activity.active_tournaments.map((item) => item.id)).toEqual(['t1']);
      expect(activity.archived_tournaments.map((item) => item.id)).toEqual(['a1']);
      expect(activity.abandoned_unknown).toBe(5);
    });

    it('reads the insights of a period, or null when the database does not have them', async () => {
      const { port, givenInsights } = create();
      givenInsights(dashboardInsights());
      expect((await port.getDashboardInsights(30))?.funnel.basis).toBe(10);
      givenInsights(null);
      expect(await port.getDashboardInsights(30)).toBeNull();
    });

    it('a refused metrics read rejects with the server code in the message', async () => {
      const { port, givenData, fail } = create();
      givenData(dashboardMetrics(), dashboardActivity());
      fail('not_authorized');
      const error: unknown = await port.getDashboardMetrics().catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('not_authorized');
    });

    it('a refused read rejects with the server code in the message', async () => {
      const { port, given, fail } = create();
      given('local', tournament('t-1', 'archived'));
      fail('not_authorized');
      const error: unknown = await port.getDashboardTournament('local', 't-1').catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('not_authorized');
    });
  });
}
