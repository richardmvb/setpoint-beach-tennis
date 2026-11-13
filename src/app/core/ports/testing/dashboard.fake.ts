import type { DashboardInsights } from '../../dashboard-insights';
import type { SharedTournamentSnapshot } from '../../models';
import type {
  DashboardActivity,
  DashboardMetrics,
  DashboardRepository,
  DashboardTournamentSource,
} from '../dashboard.port';

type TournamentCore = Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>;

/** The part of the dashboard the admin pages use: the product numbers, the activity lists and one tournament. */
export type DashboardViewerPort = Pick<
  DashboardRepository,
  'getDashboardTournament' | 'getDashboardMetrics' | 'getDashboardActivity' | 'getDashboardInsights'
>;

/**
 * In-memory admin reads for specs: `given*` sets what the server has (insights `null` = an older database without
 * them), `fail` refuses the next reads with an error code.
 */
export class FakeDashboard implements DashboardViewerPort {
  private readonly tournaments = new Map<string, TournamentCore>();
  private metrics: DashboardMetrics | null = null;
  private activity: DashboardActivity | null = null;
  private insights: DashboardInsights | null = null;
  private failure: string | null = null;
  /** The tournaments asked for, in order. */
  readonly reads: { source: DashboardTournamentSource; id: string }[] = [];
  /** The insight periods asked for, in order. */
  readonly insightReads: number[] = [];

  given(source: DashboardTournamentSource, tournament: TournamentCore): void {
    this.tournaments.set(`${source}:${tournament.id}`, structuredClone(tournament));
  }
  givenMetrics(metrics: DashboardMetrics): void {
    this.metrics = structuredClone(metrics);
  }
  givenActivity(activity: DashboardActivity): void {
    this.activity = structuredClone(activity);
  }
  givenInsights(insights: DashboardInsights | null): void {
    this.insights = structuredClone(insights);
  }
  fail(code: string | null): void {
    this.failure = code;
  }

  getDashboardTournament(source: DashboardTournamentSource, id: string): Promise<TournamentCore> {
    this.reads.push({ source, id });
    if (this.failure) return Promise.reject(new Error(this.failure));
    const tournament = this.tournaments.get(`${source}:${id}`);
    return tournament ? Promise.resolve(structuredClone(tournament)) : Promise.reject(new Error('not_authorized'));
  }
  getDashboardMetrics(): Promise<DashboardMetrics> {
    return this.answer(this.metrics);
  }
  getDashboardActivity(): Promise<DashboardActivity> {
    return this.answer(this.activity);
  }
  getDashboardInsights(days: number): Promise<DashboardInsights | null> {
    this.insightReads.push(days);
    if (this.failure) return Promise.reject(new Error(this.failure));
    return Promise.resolve(structuredClone(this.insights));
  }

  private answer<T>(value: T | null): Promise<T> {
    if (this.failure) return Promise.reject(new Error(this.failure));
    return value ? Promise.resolve(structuredClone(value)) : Promise.reject(new Error('not_authorized'));
  }
}
