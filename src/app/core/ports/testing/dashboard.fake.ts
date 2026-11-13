import type { SharedTournamentSnapshot } from '../../models';
import type { DashboardRepository, DashboardTournamentSource } from '../dashboard.port';

type TournamentCore = Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>;

/** The part of the dashboard an admin viewer uses: read one tournament of either kind. */
export type DashboardViewerPort = Pick<DashboardRepository, 'getDashboardTournament'>;

/** In-memory admin reads for specs: `given` stores a tournament under its source and id, `fail` refuses the next reads. */
export class FakeDashboard implements DashboardViewerPort {
  private readonly tournaments = new Map<string, TournamentCore>();
  private failure: string | null = null;
  /** The tournaments asked for, in order. */
  readonly reads: { source: DashboardTournamentSource; id: string }[] = [];

  given(source: DashboardTournamentSource, tournament: TournamentCore): void {
    this.tournaments.set(`${source}:${tournament.id}`, structuredClone(tournament));
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
}
