import {
  ABANDONMENT_STAGE_LABEL,
  type AbandonmentStageId,
  buildInsights,
  type DashboardInsights,
  formatLabel,
  type FunnelStep,
  funnelSteps,
  type HeatmapGrid,
  heatmapGrid,
  type Insight,
  type KpiCard,
  kpiCards,
  share,
  trendChart,
  type TrendChart,
} from '../../../core/dashboard-insights';
import type { DashboardActiveTournament, DashboardActivity } from '../../../core/ports/dashboard.port';

export type DashboardTab = 'summary' | 'usage' | 'tournaments';
export type ListMode = 'active' | 'archived';
type MixKind = 'mode' | 'size' | 'doubles' | 'hosting';
type AdoptionId = keyof DashboardInsights['adoption'];
type RetentionId = 'one' | 'two' | 'threePlus';

/** A bar of a mix; `key` is the raw value (`super`, `24`, `mixed`, `shared`), the template names it. */
interface MixRow {
  key: string;
  count: number;
  percent: number;
}

/** Everything the Resumo and Uso tabs draw. Labels are ids; text from `core/dashboard-insights` is pt-BR as it comes. */
export interface DashboardView {
  cards: KpiCard[];
  insights: Insight[];
  funnel: FunnelStep[];
  chart: TrendChart;
  grid: HeatmapGrid;
  formats: { label: string; started: number; finished: number; rate: number }[];
  mixes: { kind: MixKind; rows: MixRow[] }[];
  adoption: { id: AdoptionId; used: number; of: number; percent: number }[];
  retention: { id: RetentionId; count: number; percent: number }[];
}

export interface AbandonmentStage {
  id: AbandonmentStageId;
  count: number;
  percent: number;
}

/** The order the adoption list is shown in. */
const ADOPTION_ORDER: readonly AdoptionId[] = [
  'live_link',
  'qualification',
  'point_by_point',
  'early_finals',
  'mixed_doubles',
  'fixed_pairs',
];

function mixRows(record: Record<string, number>): MixRow[] {
  const total = Object.values(record).reduce((sum, count) => sum + count, 0);
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, percent: share(count, total) }));
}

/** The abandoned tournaments by the stage where they stopped, with each stage's share of the total. */
export function abandonmentStages(activity: DashboardActivity | null): AbandonmentStage[] {
  if (!activity) return [];
  const stages: { id: AbandonmentStageId; count: number }[] = [
    { id: 'registration', count: activity.abandoned_registration },
    { id: 'noScores', count: activity.abandoned_no_scores },
    { id: 'underHalf', count: activity.abandoned_under_half },
    { id: 'overHalf', count: activity.abandoned_over_half },
    { id: 'roundsComplete', count: activity.abandoned_rounds_complete },
    { id: 'finals', count: activity.abandoned_finals },
    { id: 'unknown', count: activity.abandoned_unknown },
  ];
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return stages.map((stage) => ({ ...stage, percent: total ? Math.round((stage.count * 100) / total) : 0 }));
}

/** The known stage where most tournaments stopped; null when none did. */
export function mainDropoff(stages: AbandonmentStage[]): AbandonmentStage | null {
  return stages
    .filter((stage) => stage.id !== 'unknown')
    .reduce<AbandonmentStage | null>((best, stage) => (stage.count > (best?.count ?? 0) ? stage : best), null);
}

export function buildDashboardView(data: DashboardInsights, dropoff: AbandonmentStage | null): DashboardView {
  const r = data.retention;
  return {
    cards: kpiCards(data),
    insights: buildInsights(data, dropoff && { label: ABANDONMENT_STAGE_LABEL[dropoff.id], count: dropoff.count }),
    funnel: funnelSteps(data.funnel),
    chart: trendChart(data.series),
    grid: heatmapGrid(data.heatmap),
    formats: data.formats.map((row) => ({
      label: formatLabel(row.mode, row.size, row.doubles),
      started: row.started,
      finished: row.finished,
      rate: share(row.finished, row.started),
    })),
    mixes: (['mode', 'size', 'doubles', 'hosting'] as const).map((kind) => ({ kind, rows: mixRows(data.mix[kind]) })),
    adoption: ADOPTION_ORDER.map((id) => ({
      id,
      used: data.adoption[id].used,
      of: data.adoption[id].of,
      percent: share(data.adoption[id].used, data.adoption[id].of),
    })),
    retention: [
      { id: 'one', count: r.one_time, percent: share(r.one_time, r.moderators_total) },
      { id: 'two', count: r.two, percent: share(r.two, r.moderators_total) },
      { id: 'threePlus', count: r.three_plus, percent: share(r.three_plus, r.moderators_total) },
    ],
  };
}

/** The tournaments of the chosen list whose name contains the search (case-insensitive). */
export function visibleTournaments(
  activity: DashboardActivity | null,
  mode: ListMode,
  search: string,
): DashboardActiveTournament[] {
  if (!activity) return [];
  const tournaments = mode === 'active' ? activity.active_tournaments : activity.archived_tournaments;
  const query = search.trim().toLocaleLowerCase();
  return query ? tournaments.filter((item) => item.name.toLocaleLowerCase().includes(query)) : tournaments;
}

/** Points for a 100x26 sparkline. */
export function sparkPoints(values: number[]): string {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 100 / (values.length - 1) : 100;
  return values.map((value, index) => `${(index * step).toFixed(1)},${(24 - (value / max) * 22).toFixed(1)}`).join(' ');
}

/** A heatmap cell's intensity, 0 to 1. */
export function heatCell(count: number, grid: HeatmapGrid): number {
  return grid.max ? count / grid.max : 0;
}

/** Hours and minutes of an average duration; null when there is none. The template writes the units. */
export function durationParts(seconds: number | null): { hours: number; minutes: number } | null {
  if (seconds === null) return null;
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
