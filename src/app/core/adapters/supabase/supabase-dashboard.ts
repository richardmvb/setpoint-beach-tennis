import { inject, Injectable } from '@angular/core';
import type { DashboardInsights } from '../../dashboard-insights';
import { CLOCK } from '../../ports/clock.port';
import type { SharedTournamentSnapshot } from '../../models';
import type {
  DashboardActiveTournament,
  DashboardActivity,
  DashboardLocalArchive,
  DashboardMetrics,
  DashboardRepository,
  DashboardTournamentSource,
} from '../../ports/dashboard.port';
import {
  parseDashboardActivity,
  parseDashboardInsights,
  parseDashboardMetrics,
  parseDashboardTournamentList,
  parseTournamentCore,
} from '../../../shared/parsers/rpc-responses';
import { AppSupabaseClient, requireSupabaseClient, SUPABASE_CLIENT } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class SupabaseDashboard implements DashboardRepository {
  private readonly client: AppSupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly clock = inject(CLOCK);

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const { data, error } = await this.requireClient().rpc('get_dashboard_metrics');
    if (error) throw error;
    return parseDashboardMetrics(data);
  }

  /** Product insights for the last `days` days. Null when the migration is not applied yet (the rest of the dashboard keeps working). */
  async getDashboardInsights(days: number): Promise<DashboardInsights | null> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    const { data, error } = await this.requireClient().rpc('get_dashboard_insights', { p_days: days, p_tz: timezone });
    if (error) {
      if (error.code === 'PGRST202') return null;
      throw error;
    }
    return parseDashboardInsights(data);
  }

  async getDashboardActivity(): Promise<DashboardActivity> {
    const client = this.requireClient();
    const [activityResult, localResult, archiveResult] = await Promise.all([
      client.rpc('get_dashboard_activity'),
      client.rpc('get_dashboard_archived_local_tournaments'),
      client.rpc('get_dashboard_local_archives'),
    ]);
    if (activityResult.error) throw activityResult.error;
    if (localResult.error && localResult.error.code !== 'PGRST202') throw localResult.error;
    // The archive RPC is newer than the rest: a deploy without its migration must keep working.
    if (archiveResult.error && archiveResult.error.code !== 'PGRST202') throw archiveResult.error;
    const activity = parseDashboardActivity(activityResult.data);
    const archives = parseDashboardTournamentList(archiveResult.data);
    // A tournament published live and archived appears once, as the archive (it has every detail).
    const supersededLiveIds = new Set(archives.map((archive) => archive.live_id).filter((id): id is string => !!id));
    const keep = (item: DashboardActiveTournament): boolean =>
      !(item.source === 'local' && supersededLiveIds.has(item.id));
    const dayAgo = this.clock.now() - 24 * 60 * 60 * 1000;
    const isLive = (archive: DashboardLocalArchive & { status?: string }): boolean =>
      archive.status === 'active' && Date.parse(archive.updated_at) > dayAgo;
    const byRecent = (first: DashboardActiveTournament, second: DashboardActiveTournament): number =>
      Date.parse(second.updated_at) - Date.parse(first.updated_at);
    return {
      ...activity,
      active_tournaments: [...activity.active_tournaments.filter(keep), ...archives.filter(isLive)].sort(byRecent),
      archived_tournaments: [
        ...activity.archived_tournaments.filter(keep),
        ...parseDashboardTournamentList(localResult.data).filter(keep),
        ...archives.filter((archive) => !isLive(archive)),
      ].sort(byRecent),
      local_archives_available: !localResult.error,
    };
  }

  async getDashboardTournament(
    source: DashboardTournamentSource,
    id: string,
  ): Promise<Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>> {
    const { data, error } = await this.requireClient().rpc('get_dashboard_tournament', {
      p_source: source,
      p_tournament_id: id,
    });
    if (error) throw error;
    return parseTournamentCore(data);
  }

  private requireClient(): AppSupabaseClient {
    return requireSupabaseClient(this.client);
  }
}
