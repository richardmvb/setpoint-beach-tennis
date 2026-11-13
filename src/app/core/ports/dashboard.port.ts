import { InjectionToken } from '@angular/core';
import type { DashboardInsights } from '../dashboard-insights';
import type { SharedTournamentSnapshot } from '../models';

export interface DashboardMetrics {
  tournaments_total: number;
  tournaments_started: number;
  tournaments_completed: number;
  tournaments_active: number;
  tournaments_archived: number;
  tournaments_abandoned: number;
  tournaments_size_24: number;
  super_tournaments: number;
  group_tournaments: number;
  mixed_tournaments: number;
  open_tournaments: number;
  participants_total: number;
  participants_invited: number;
  participants_manual: number;
  moderators_total: number;
  moderators_returned: number;
  completion_rate: number | null;
  average_duration_seconds: number | null;
}

export type DashboardTournamentSource = 'shared' | 'local';

export interface DashboardActiveTournament {
  id: string;
  source: DashboardTournamentSource;
  name: string;
  size: number;
  mode: string;
  updated_at: string;
  matches_completed: number;
  matches_total: number;
}

export interface DashboardLocalArchive extends DashboardActiveTournament {
  live_id: string | null;
}

export interface DashboardActivity {
  active_tournaments: DashboardActiveTournament[];
  archived_tournaments: DashboardActiveTournament[];
  local_archives_available?: boolean;
  abandoned_registration: number;
  abandoned_no_scores: number;
  abandoned_under_half: number;
  abandoned_over_half: number;
  abandoned_rounds_complete: number;
  abandoned_finals: number;
  abandoned_unknown: number;
}

/** Read-only admin dashboard data. */
export interface DashboardRepository {
  getDashboardMetrics(): Promise<DashboardMetrics>;
  /** Product insights for the last `days` days. Null when the backend does not have them yet. */
  getDashboardInsights(days: number): Promise<DashboardInsights | null>;
  getDashboardActivity(): Promise<DashboardActivity>;
  getDashboardTournament(
    source: DashboardTournamentSource,
    id: string,
  ): Promise<Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>>;
}
export const DASHBOARD = new InjectionToken<DashboardRepository>('DashboardRepository');
