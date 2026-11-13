import type { DashboardInsights } from '../core/dashboard-insights';
import type { DashboardActiveTournament, DashboardActivity, DashboardMetrics } from '../core/ports/dashboard.port';

/** Admin metrics with every counter set; pass what the test cares about. */
export function dashboardMetrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    tournaments_total: 40,
    tournaments_started: 30,
    tournaments_completed: 20,
    tournaments_active: 3,
    tournaments_archived: 5,
    tournaments_abandoned: 4,
    tournaments_size_24: 2,
    super_tournaments: 25,
    group_tournaments: 15,
    mixed_tournaments: 10,
    open_tournaments: 30,
    participants_total: 320,
    participants_invited: 200,
    participants_manual: 120,
    moderators_total: 12,
    moderators_returned: 5,
    completion_rate: 66.7,
    average_duration_seconds: 5400,
    ...overrides,
  };
}

/** One row of the dashboard's tournament lists. */
export function dashboardTournament(overrides: Partial<DashboardActiveTournament> = {}): DashboardActiveTournament {
  return {
    id: 't1',
    source: 'shared',
    name: 'Torneio de sábado',
    size: 8,
    mode: 'super',
    updated_at: '2026-11-13T10:00:00.000Z',
    matches_completed: 6,
    matches_total: 14,
    ...overrides,
  };
}

/** Activity with one active and one archived tournament and a few abandoned ones. */
export function dashboardActivity(overrides: Partial<DashboardActivity> = {}): DashboardActivity {
  return {
    active_tournaments: [dashboardTournament()],
    archived_tournaments: [dashboardTournament({ id: 'a1', source: 'local', name: 'Arquivo de outubro' })],
    local_archives_available: true,
    abandoned_registration: 2,
    abandoned_no_scores: 1,
    abandoned_under_half: 3,
    abandoned_over_half: 0,
    abandoned_rounds_complete: 0,
    abandoned_finals: 1,
    abandoned_unknown: 5,
    ...overrides,
  };
}

/** Insights for a 30-day period with the same numbers in both halves. */
export function dashboardInsights(overrides: Partial<DashboardInsights> = {}): DashboardInsights {
  const kpis = {
    started: 10,
    finished: 6,
    completion_rate: 60,
    players: 90,
    avg_players: 9,
    matches_scored: 120,
    moderators: 5,
    new_moderators: 2,
  };
  return {
    period: { days: 30, from: '2026-10-14', to: '2026-11-13', timezone: 'America/Sao_Paulo' },
    kpis: { current: kpis, previous: { ...kpis } },
    duration: { median_seconds: 5400, p90_seconds: 9000 },
    series: [
      { date: '2026-11-12', started: 2, shared: 1, finished: 1 },
      { date: '2026-11-13', started: 3, shared: 2, finished: 2 },
    ],
    mix: {
      mode: { super: 7, groups: 3 },
      size: { 8: 5, 12: 3, 24: 2 },
      doubles: { open: 8, mixed: 2 },
      hosting: { shared: 4, local: 6 },
    },
    formats: [{ mode: 'super', size: 8, doubles: 'open', started: 5, finished: 4 }],
    funnel: { basis: 10, started: 10, with_scores: 9, half_played: 8, rounds_done: 7, reached_finals: 6, finished: 6 },
    registration: { created: 5, started: 4, expired: 1, avg_guests: 6 },
    heatmap: [{ dow: 6, hour: 9, count: 4 }],
    adoption: {
      live_link: { used: 5, of: 10 },
      qualification: { used: 3, of: 5 },
      early_finals: { used: 0, of: 0 },
      point_by_point: { used: 2, of: 6 },
      mixed_doubles: { used: 2, of: 10 },
      fixed_pairs: { used: 1, of: 3 },
    },
    retention: { moderators_total: 10, one_time: 4, two: 4, three_plus: 2, active_new: 2, active_returning: 3 },
    coverage: { local_started: 6, local_with_detail: 5 },
    generated_at: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}
