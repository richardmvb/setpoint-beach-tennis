/**
 * Shapes the get_dashboard_insights payload for the dashboard and turns it into plain-language findings.
 * Pure functions only (no Angular, no network), so every rule is unit tested.
 */

interface InsightsKpiSet {
  started: number;
  finished: number;
  completion_rate: number | null;
  players: number;
  avg_players: number | null;
  matches_scored: number;
  moderators: number;
  new_moderators: number;
}

interface Adoption {
  used: number;
  of: number;
}

export interface DashboardInsights {
  period: { days: number; from: string; to: string; timezone: string };
  kpis: { current: InsightsKpiSet; previous: InsightsKpiSet };
  duration: { median_seconds: number | null; p90_seconds: number | null };
  series: { date: string; started: number; shared: number; finished: number }[];
  mix: {
    mode: Record<string, number>;
    size: Record<string, number>;
    doubles: Record<string, number>;
    hosting: Record<string, number>;
  };
  formats: { mode: string; size: number; doubles: string; started: number; finished: number }[];
  funnel: {
    basis: number;
    started: number;
    with_scores: number;
    half_played: number;
    rounds_done: number;
    reached_finals: number;
    finished: number;
  };
  registration: { created: number; started: number; expired: number; avg_guests: number | null };
  heatmap: { dow: number; hour: number; count: number }[];
  adoption: {
    live_link: Adoption;
    qualification: Adoption;
    early_finals: Adoption;
    point_by_point: Adoption;
    mixed_doubles: Adoption;
    fixed_pairs: Adoption;
  };
  retention: {
    moderators_total: number;
    one_time: number;
    two: number;
    three_plus: number;
    active_new: number;
    active_returning: number;
  };
  coverage: { local_started: number; local_with_detail: number };
  generated_at: string;
}

type InsightTone = 'good' | 'warn' | 'info';
export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
}

interface Delta {
  direction: 'up' | 'down' | 'flat' | 'new' | 'none';
  percent: number | null;
  label: string;
}

/** Where an abandoned tournament stopped (the dashboard's "Onde os torneios pararam" list). */
/** Every piece of text the numbers need. The words are in `dashboard/pt-BR` (see `DashboardText`), so this module stays pure. */
export type TextKey =
  | 'insights.volume.new.title'
  | 'insights.volume.new.detail'
  | 'insights.volume.up.title'
  | 'insights.volume.up.detail'
  | 'insights.volume.down.title'
  | 'insights.volume.down.detail'
  | 'insights.volume.stable.title'
  | 'insights.volume.stable.detail'
  | 'insights.completion.low.title'
  | 'insights.completion.low.detail'
  | 'insights.completion.high.title'
  | 'insights.completion.high.detail'
  | 'insights.funnel.title'
  | 'insights.funnel.detailScores'
  | 'insights.funnel.detailOther'
  | 'insights.dropoff.title'
  | 'insights.dropoff.detail'
  | 'insights.format.title'
  | 'insights.format.detail'
  | 'insights.peak.title'
  | 'insights.peak.detail'
  | 'insights.retention.low.title'
  | 'insights.retention.low.detail'
  | 'insights.retention.high.title'
  | 'insights.retention.high.detail'
  | 'insights.qualification.low.title'
  | 'insights.qualification.low.detail'
  | 'insights.qualification.high.title'
  | 'insights.qualification.high.detail'
  | 'insights.pbp.title'
  | 'insights.pbp.detail'
  | 'insights.hosting.title'
  | 'insights.hosting.detail'
  | 'insights.coverage.title'
  | 'insights.coverage.detail'
  | 'weekday.0'
  | 'weekday.1'
  | 'weekday.2'
  | 'weekday.3'
  | 'weekday.4'
  | 'weekday.5'
  | 'weekday.6'
  | 'format.superOpen'
  | 'format.superMixed'
  | 'format.groupsOpen'
  | 'format.groupsMixed'
  | 'funnelStep.started'
  | 'funnelStep.with_scores'
  | 'funnelStep.half_played'
  | 'funnelStep.rounds_done'
  | 'funnelStep.reached_finals'
  | 'funnelStep.finished'
  | 'delta.flat'
  | 'delta.new'
  | 'kpi.started.label'
  | 'kpi.started.hint'
  | 'kpi.completion.label'
  | 'kpi.completion.hintSome'
  | 'kpi.completion.hintNone'
  | 'kpi.players.label'
  | 'kpi.players.hintAverage'
  | 'kpi.players.hintNone'
  | 'kpi.matches.label'
  | 'kpi.matches.hint'
  | 'kpi.moderators.label'
  | 'kpi.moderators.hintOne'
  | 'kpi.moderators.hintMany'
  | 'kpi.duration.label'
  | 'kpi.duration.hintNone'
  | 'kpi.duration.hintP90'
  | 'abandonment.registration'
  | 'abandonment.noScores'
  | 'abandonment.underHalf'
  | 'abandonment.overHalf'
  | 'abandonment.roundsComplete'
  | 'abandonment.finals'
  | 'abandonment.unknown';

export type TextParams = Record<string, string | number>;

/** Gives the words for a key (the feature supplies it; specs use the pt-BR file). */
export type Texts = (key: TextKey, params?: TextParams) => string;

export type AbandonmentStageId =
  'registration' | 'noScores' | 'underHalf' | 'overHalf' | 'roundsComplete' | 'finals' | 'unknown';

export function formatLabel(mode: string, size: number | string, doubles: string, t: Texts): string {
  const mixed = doubles === 'mixed';
  return mode === 'groups'
    ? t(mixed ? 'format.groupsMixed' : 'format.groupsOpen', { size })
    : t(mixed ? 'format.superMixed' : 'format.superOpen', { size });
}

/** Change versus the previous period. A zero baseline is "novo", never an invented percentage. */
export function kpiDelta(current: number | null, previous: number | null, t: Texts, unit: '%' | 'pts' = '%'): Delta {
  if (current === null || previous === null) return { direction: 'none', percent: null, label: '—' };
  if (previous === 0)
    return current === 0
      ? { direction: 'flat', percent: 0, label: t('delta.flat') }
      : { direction: 'new', percent: null, label: t('delta.new') };
  if (unit === 'pts') {
    const diff = Math.round((current - previous) * 10) / 10;
    return {
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
      percent: diff,
      label: diff === 0 ? t('delta.flat') : `${diff > 0 ? '+' : ''}${diff} pts`,
    };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
    percent,
    label: percent === 0 ? t('delta.flat') : `${percent > 0 ? '+' : ''}${percent}%`,
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  ofStart: number;
  ofPrevious: number;
}

export function funnelSteps(funnel: DashboardInsights['funnel'], t: Texts): FunnelStep[] {
  const raw: [string, string, number][] = [
    ['started', t('funnelStep.started'), funnel.started],
    ['with_scores', t('funnelStep.with_scores'), funnel.with_scores],
    ['half_played', t('funnelStep.half_played'), funnel.half_played],
    ['rounds_done', t('funnelStep.rounds_done'), funnel.rounds_done],
    ['reached_finals', t('funnelStep.reached_finals'), funnel.reached_finals],
    ['finished', t('funnelStep.finished'), funnel.finished],
  ];
  const start = raw[0][2];
  return raw.map(([key, label, count], index) => ({
    key,
    label,
    count,
    ofStart: start ? Math.round((count / start) * 100) : 0,
    ofPrevious: index === 0 ? 100 : raw[index - 1][2] ? Math.round((count / raw[index - 1][2]) * 100) : 0,
  }));
}

export interface HeatmapGrid {
  rows: number[][];
  max: number;
  peak: { dow: number; hour: number; count: number } | null;
}

/** Weekday rows start on Monday; each row has 24 hour cells. */
export function heatmapGrid(cells: DashboardInsights['heatmap']): HeatmapGrid {
  const rows = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let peak: HeatmapGrid['peak'] = null;
  for (const cell of cells) {
    const row = (cell.dow + 6) % 7;
    rows[row][cell.hour] += cell.count;
    if (!peak || cell.count > peak.count) peak = { dow: cell.dow, hour: cell.hour, count: cell.count };
  }
  return { rows, max: Math.max(0, ...rows.flat()), peak };
}

export function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}

function top(record: Record<string, number>): { key: string; count: number; total: number } | null {
  const entries = Object.entries(record);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return null;
  const [key, count] = entries.sort((a, b) => b[1] - a[1])[0];
  return { key, count, total };
}

function weekday(dow: number, t: Texts): string {
  switch (dow) {
    case 0:
      return t('weekday.0');
    case 1:
      return t('weekday.1');
    case 2:
      return t('weekday.2');
    case 3:
      return t('weekday.3');
    case 4:
      return t('weekday.4');
    case 5:
      return t('weekday.5');
    default:
      return t('weekday.6');
  }
}

const TONE_ORDER: Record<InsightTone, number> = { warn: 0, good: 1, info: 2 };

/** Findings worth acting on, most urgent first. Rules need a minimum sample so small numbers do not shout. */
export function buildInsights(
  data: DashboardInsights,
  t: Texts,
  mainDropoff: { label: string; count: number } | null = null,
): Insight[] {
  const out: Insight[] = [];
  const { current, previous } = data.kpis;

  // 1. Volume versus the previous period
  if (current.started + previous.started > 0) {
    const delta = kpiDelta(current.started, previous.started, t);
    if (delta.direction === 'new')
      out.push({
        id: 'volume',
        tone: 'good',
        title: t('insights.volume.new.title'),
        detail: t('insights.volume.new.detail', { started: current.started }),
      });
    else if (delta.percent !== null && delta.percent >= 20)
      out.push({
        id: 'volume',
        tone: 'good',
        title: t('insights.volume.up.title', { percent: delta.percent }),
        detail: t('insights.volume.up.detail', {
          started: current.started,
          previous: previous.started,
          days: data.period.days,
        }),
      });
    else if (delta.percent !== null && delta.percent <= -20)
      out.push({
        id: 'volume',
        tone: 'warn',
        title: t('insights.volume.down.title', { percent: Math.abs(delta.percent) }),
        detail: t('insights.volume.down.detail', {
          started: current.started,
          previous: previous.started,
          days: data.period.days,
        }),
      });
    else
      out.push({
        id: 'volume',
        tone: 'info',
        title: t('insights.volume.stable.title'),
        detail: t('insights.volume.stable.detail', { started: current.started, previous: previous.started }),
      });
  }

  // 2. Completion
  if (current.started >= 3 && current.completion_rate !== null) {
    if (current.completion_rate < 40)
      out.push({
        id: 'completion',
        tone: 'warn',
        title: t('insights.completion.low.title', { percent: Math.round(current.completion_rate) }),
        detail: t('insights.completion.low.detail', { finished: current.finished, started: current.started }),
      });
    else if (current.completion_rate >= 70)
      out.push({
        id: 'completion',
        tone: 'good',
        title: t('insights.completion.high.title', { percent: Math.round(current.completion_rate) }),
        detail: t('insights.completion.high.detail', { finished: current.finished, started: current.started }),
      });
  }

  // 3. Where the funnel leaks the most
  const steps = funnelSteps(data.funnel, t);
  if (data.funnel.basis >= 3) {
    let worst: { from: FunnelStep; to: FunnelStep; drop: number } | null = null;
    for (let i = 1; i < steps.length; i++) {
      const drop = 100 - steps[i].ofPrevious;
      if (steps[i - 1].count > 0 && drop >= 25 && (!worst || drop > worst.drop))
        worst = { from: steps[i - 1], to: steps[i], drop };
    }
    if (worst) {
      out.push({
        id: 'funnel',
        tone: 'warn',
        title: t('insights.funnel.title', { drop: worst.drop, from: worst.from.label, to: worst.to.label }),
        detail: t(worst.to.key === 'with_scores' ? 'insights.funnel.detailScores' : 'insights.funnel.detailOther'),
      });
    }
  }
  if (mainDropoff && mainDropoff.count >= 3)
    out.push({
      id: 'dropoff',
      tone: 'info',
      title: t('insights.dropoff.title', { stage: mainDropoff.label.toLocaleLowerCase('pt-BR') }),
      detail: t('insights.dropoff.detail', { count: mainDropoff.count }),
    });

  // 4. Most used format
  const size = top(data.mix.size);
  const mode = top(data.mix.mode);
  if (size && mode && size.total >= 4 && share(size.count, size.total) >= 40) {
    out.push({
      id: 'format',
      tone: 'info',
      title: t('insights.format.title', { format: formatLabel(mode.key, size.key, 'open', t) }),
      detail: t('insights.format.detail', {
        count: size.count,
        total: size.total,
        percent: share(size.count, size.total),
        size: size.key,
      }),
    });
  }

  // 5. Peak usage
  const grid = heatmapGrid(data.heatmap);
  if (grid.peak && grid.peak.count >= 2) {
    out.push({
      id: 'peak',
      tone: 'info',
      title: t('insights.peak.title', {
        weekday: weekday(grid.peak.dow, t),
        hour: String(grid.peak.hour).padStart(2, '0'),
      }),
      detail: t('insights.peak.detail', { count: grid.peak.count }),
    });
  }

  // 6. Retention
  const r = data.retention;
  if (r.moderators_total >= 5) {
    const returning = share(r.two + r.three_plus, r.moderators_total);
    if (returning < 30)
      out.push({
        id: 'retention',
        tone: 'warn',
        title: t('insights.retention.low.title', { percent: returning }),
        detail: t('insights.retention.low.detail', { oneTime: r.one_time, total: r.moderators_total }),
      });
    else if (returning >= 50)
      out.push({
        id: 'retention',
        tone: 'good',
        title: t('insights.retention.high.title', { percent: returning }),
        detail: t('insights.retention.high.detail', { returning: r.two + r.three_plus, total: r.moderators_total }),
      });
  }

  // 7. Feature adoption
  const q = data.adoption.qualification;
  if (q.of >= 3) {
    const pct = share(q.used, q.of);
    if (pct < 30)
      out.push({
        id: 'qualification',
        tone: 'warn',
        title: t('insights.qualification.low.title', { percent: pct }),
        detail: t('insights.qualification.low.detail', { used: q.used, of: q.of }),
      });
    else if (pct >= 60)
      out.push({
        id: 'qualification',
        tone: 'good',
        title: t('insights.qualification.high.title', { percent: pct }),
        detail: t('insights.qualification.high.detail', { used: q.used, of: q.of }),
      });
  }
  const pbp = data.adoption.point_by_point;
  if (pbp.of >= 3 && share(pbp.used, pbp.of) >= 50)
    out.push({
      id: 'pbp',
      tone: 'good',
      title: t('insights.pbp.title', { percent: share(pbp.used, pbp.of) }),
      detail: t('insights.pbp.detail', { used: pbp.used, of: pbp.of }),
    });

  // 8. Hosting mix
  const hosting = data.mix.hosting;
  const hostTotal = (hosting['shared'] ?? 0) + (hosting['local'] ?? 0);
  if (hostTotal >= 5 && share(hosting['shared'] ?? 0, hostTotal) < 20)
    out.push({
      id: 'hosting',
      tone: 'info',
      title: t('insights.hosting.title', { percent: share(hosting['shared'] ?? 0, hostTotal) }),
      detail: t('insights.hosting.detail'),
    });

  // 9. Data coverage (so the reader knows how much detail the numbers rest on)
  const c = data.coverage;
  if (c.local_started > 0 && c.local_with_detail < c.local_started) {
    out.push({
      id: 'coverage',
      tone: 'info',
      title: t('insights.coverage.title', { percent: share(c.local_with_detail, c.local_started) }),
      detail: t('insights.coverage.detail'),
    });
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).slice(0, 6);
}

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  hint: string;
  delta: Delta;
  /** Daily values for the little sparkline, when the metric has a daily series. */
  spark: number[] | null;
}

export function kpiCards(data: DashboardInsights, t: Texts): KpiCard[] {
  const { current, previous } = data.kpis;
  const started = data.series.map((day) => day.started);
  const finished = data.series.map((day) => day.finished);
  return [
    {
      key: 'started',
      label: t('kpi.started.label'),
      value: String(current.started),
      hint: t('kpi.started.hint', { finished: current.finished }),
      delta: kpiDelta(current.started, previous.started, t),
      spark: started,
    },
    {
      key: 'completion',
      label: t('kpi.completion.label'),
      value: current.completion_rate === null ? '—' : `${Math.round(current.completion_rate)}%`,
      hint: current.started
        ? t('kpi.completion.hintSome', { finished: current.finished, started: current.started })
        : t('kpi.completion.hintNone'),
      delta: kpiDelta(current.completion_rate, previous.completion_rate, t, 'pts'),
      spark: finished,
    },
    {
      key: 'players',
      label: t('kpi.players.label'),
      value: String(current.players),
      hint: current.avg_players
        ? t('kpi.players.hintAverage', { average: current.avg_players })
        : t('kpi.players.hintNone'),
      delta: kpiDelta(current.players, previous.players, t),
      spark: null,
    },
    {
      key: 'matches',
      label: t('kpi.matches.label'),
      value: String(current.matches_scored),
      hint: t('kpi.matches.hint'),
      delta: kpiDelta(current.matches_scored, previous.matches_scored, t),
      spark: null,
    },
    {
      key: 'moderators',
      label: t('kpi.moderators.label'),
      value: String(current.moderators),
      hint:
        current.new_moderators === 1
          ? t('kpi.moderators.hintOne', { count: current.new_moderators })
          : t('kpi.moderators.hintMany', { count: current.new_moderators }),
      delta: kpiDelta(current.moderators, previous.moderators, t),
      spark: null,
    },
    {
      key: 'duration',
      label: t('kpi.duration.label'),
      value: formatDuration(data.duration.median_seconds),
      hint:
        data.duration.p90_seconds === null
          ? t('kpi.duration.hintNone')
          : t('kpi.duration.hintP90', { duration: formatDuration(data.duration.p90_seconds) }),
      delta: { direction: 'none', percent: null, label: '' },
      spark: null,
    },
  ];
}

export interface TrendChart {
  bars: { x: number; y: number; width: number; height: number; date: string; started: number; finished: number }[];
  finishedLine: string;
  max: number;
  labels: { x: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
  height: number;
}

/** Daily bars (started) with a line (finished) in a width x height box. */
export function trendChart(series: DashboardInsights['series'], width = 600, height = 210): TrendChart {
  const count = series.length;
  const max = Math.max(1, ...series.map((day) => Math.max(day.started, day.finished)));
  if (!count) return { bars: [], finishedLine: '', max, labels: [], height };
  const slot = width / count;
  const barWidth = Math.max(2, slot * 0.62);
  const usable = height - 6;
  const bars = series.map((day, index) => {
    const barHeight = day.started ? Math.max(3, (day.started / max) * usable) : 0;
    return {
      x: index * slot + (slot - barWidth) / 2,
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      date: day.date,
      started: day.started,
      finished: day.finished,
    };
  });
  const finishedLine = series
    .map(
      (day, index) => `${(index * slot + slot / 2).toFixed(1)},${(height - (day.finished / max) * usable).toFixed(1)}`,
    )
    .join(' ');
  const pick = [0, Math.floor((count - 1) / 2), count - 1];
  const labels = [...new Set(pick)].map((index) => {
    const [, month, dayOfMonth] = series[index].date.split('-');
    const anchor: 'start' | 'middle' | 'end' = index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle';
    return {
      x: anchor === 'start' ? 0 : anchor === 'end' ? width : index * slot + slot / 2,
      text: `${dayOfMonth}/${month}`,
      anchor,
    };
  });
  return { bars, finishedLine, max, labels, height };
}
