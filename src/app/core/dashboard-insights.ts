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
export type AbandonmentStageId =
  'registration' | 'noScores' | 'underHalf' | 'overHalf' | 'roundsComplete' | 'finals' | 'unknown';

/**
 * The stage names inside the insight sentences below. The dashboard's own list translates the same ids
 * (`dashboard.abandonment.*`); this pt-BR copy goes when the insights move to keys (Phase 6).
 */
export const ABANDONMENT_STAGE_LABEL: Readonly<Record<AbandonmentStageId, string>> = {
  registration: 'Durante a inscrição',
  noScores: 'Antes do primeiro placar',
  underHalf: 'Menos da metade das partidas',
  overHalf: 'Metade ou mais das partidas',
  roundsComplete: 'Após as rodadas',
  finals: 'Durante as finais',
  unknown: 'Etapa desconhecida',
};

const WEEKDAYS = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

export function formatLabel(mode: string, size: number | string, doubles: string): string {
  return `${mode === 'groups' ? 'Grupos' : 'Super'} ${size}${doubles === 'mixed' ? ' misto' : ''}`;
}

/** Change versus the previous period. A zero baseline is "novo", never an invented percentage. */
export function kpiDelta(current: number | null, previous: number | null, unit: '%' | 'pts' = '%'): Delta {
  if (current === null || previous === null) return { direction: 'none', percent: null, label: '—' };
  if (previous === 0)
    return current === 0
      ? { direction: 'flat', percent: 0, label: 'sem variação' }
      : { direction: 'new', percent: null, label: 'novo' };
  if (unit === 'pts') {
    const diff = Math.round((current - previous) * 10) / 10;
    return {
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
      percent: diff,
      label: diff === 0 ? 'sem variação' : `${diff > 0 ? '+' : ''}${diff} pts`,
    };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
    percent,
    label: percent === 0 ? 'sem variação' : `${percent > 0 ? '+' : ''}${percent}%`,
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  ofStart: number;
  ofPrevious: number;
}

export function funnelSteps(funnel: DashboardInsights['funnel']): FunnelStep[] {
  const raw: [string, string, number][] = [
    ['started', 'Iniciaram', funnel.started],
    ['with_scores', 'Lançaram o 1º placar', funnel.with_scores],
    ['half_played', 'Passaram da metade', funnel.half_played],
    ['rounds_done', 'Terminaram as rodadas', funnel.rounds_done],
    ['reached_finals', 'Chegaram às finais', funnel.reached_finals],
    ['finished', 'Finalizaram', funnel.finished],
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

const TONE_ORDER: Record<InsightTone, number> = { warn: 0, good: 1, info: 2 };

/** Findings worth acting on, most urgent first. Rules need a minimum sample so small numbers do not shout. */
export function buildInsights(
  data: DashboardInsights,
  mainDropoff: { label: string; count: number } | null = null,
): Insight[] {
  const out: Insight[] = [];
  const { current, previous } = data.kpis;

  // 1. Volume versus the previous period
  if (current.started + previous.started > 0) {
    const delta = kpiDelta(current.started, previous.started);
    if (delta.direction === 'new')
      out.push({
        id: 'volume',
        tone: 'good',
        title: 'Primeiros torneios do período',
        detail: `${current.started} iniciados, contra nenhum no período anterior.`,
      });
    else if (delta.percent !== null && delta.percent >= 20)
      out.push({
        id: 'volume',
        tone: 'good',
        title: `Uso cresceu ${delta.percent}%`,
        detail: `${current.started} torneios iniciados, contra ${previous.started} nos ${data.period.days} dias anteriores.`,
      });
    else if (delta.percent !== null && delta.percent <= -20)
      out.push({
        id: 'volume',
        tone: 'warn',
        title: `Uso caiu ${Math.abs(delta.percent)}%`,
        detail: `${current.started} torneios iniciados, contra ${previous.started} nos ${data.period.days} dias anteriores.`,
      });
    else
      out.push({
        id: 'volume',
        tone: 'info',
        title: 'Uso estável',
        detail: `${current.started} torneios iniciados, contra ${previous.started} no período anterior.`,
      });
  }

  // 2. Completion
  if (current.started >= 3 && current.completion_rate !== null) {
    if (current.completion_rate < 40)
      out.push({
        id: 'completion',
        tone: 'warn',
        title: `Só ${Math.round(current.completion_rate)}% dos torneios chegam ao fim`,
        detail: `${current.finished} de ${current.started} iniciados foram finalizados.`,
      });
    else if (current.completion_rate >= 70)
      out.push({
        id: 'completion',
        tone: 'good',
        title: `${Math.round(current.completion_rate)}% dos torneios são finalizados`,
        detail: `${current.finished} de ${current.started} iniciados chegaram ao pódio.`,
      });
  }

  // 3. Where the funnel leaks the most
  const steps = funnelSteps(data.funnel);
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
        title: `${worst.drop}% se perdem entre “${worst.from.label}” e “${worst.to.label}”`,
        detail:
          worst.to.key === 'with_scores'
            ? 'O primeiro placar é onde o torneio morre: vale simplificar o lançamento ou lembrar o organizador.'
            : 'É a maior queda do funil neste período.',
      });
    }
  }
  if (mainDropoff && mainDropoff.count >= 3)
    out.push({
      id: 'dropoff',
      tone: 'info',
      title: `Maior parada: ${mainDropoff.label.toLocaleLowerCase('pt-BR')}`,
      detail: `${mainDropoff.count} torneios compartilhados pararam nesta etapa.`,
    });

  // 4. Most used format
  const size = top(data.mix.size);
  const mode = top(data.mix.mode);
  if (size && mode && size.total >= 4 && share(size.count, size.total) >= 40) {
    out.push({
      id: 'format',
      tone: 'info',
      title: `${formatLabel(mode.key, size.key, 'open').replace(' misto', '')} é o formato mais usado`,
      detail: `${size.count} de ${size.total} torneios (${share(size.count, size.total)}%) têm ${size.key} atletas.`,
    });
  }

  // 5. Peak usage
  const grid = heatmapGrid(data.heatmap);
  if (grid.peak && grid.peak.count >= 2) {
    out.push({
      id: 'peak',
      tone: 'info',
      title: `Pico de uso: ${WEEKDAYS[grid.peak.dow]} às ${String(grid.peak.hour).padStart(2, '0')}h`,
      detail: `${grid.peak.count} torneios começaram nesse horário. Bom momento para avisos e lançamentos.`,
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
        title: `Só ${returning}% dos moderadores voltam`,
        detail: `${r.one_time} de ${r.moderators_total} organizaram um único torneio. Meus torneios e lembretes podem ajudar a trazê-los de volta.`,
      });
    else if (returning >= 50)
      out.push({
        id: 'retention',
        tone: 'good',
        title: `${returning}% dos moderadores voltam`,
        detail: `${r.two + r.three_plus} de ${r.moderators_total} organizaram dois ou mais torneios.`,
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
        title: `“Seu caminho” em só ${pct}% dos compartilhados`,
        detail: `${q.used} de ${q.of} torneios Super compartilhados ativaram. Considere deixar ligado por padrão.`,
      });
    else if (pct >= 60)
      out.push({
        id: 'qualification',
        tone: 'good',
        title: `“Seu caminho” ativado em ${pct}% dos compartilhados`,
        detail: `${q.used} de ${q.of} torneios Super compartilhados.`,
      });
  }
  const pbp = data.adoption.point_by_point;
  if (pbp.of >= 3 && share(pbp.used, pbp.of) >= 50)
    out.push({
      id: 'pbp',
      tone: 'good',
      title: `Final ponto a ponto em ${share(pbp.used, pbp.of)}% das finais`,
      detail: `${pbp.used} de ${pbp.of} torneios que chegaram às finais.`,
    });

  // 8. Hosting mix
  const hosting = data.mix.hosting;
  const hostTotal = (hosting['shared'] ?? 0) + (hosting['local'] ?? 0);
  if (hostTotal >= 5 && share(hosting['shared'] ?? 0, hostTotal) < 20)
    out.push({
      id: 'hosting',
      tone: 'info',
      title: `Compartilhados são só ${share(hosting['shared'] ?? 0, hostTotal)}% dos torneios`,
      detail:
        'A projeção, o acompanhamento ao vivo e os convites só existem neles: há espaço para convidar mais organizadores a testar.',
    });

  // 9. Data coverage (so the reader knows how much detail the numbers rest on)
  const c = data.coverage;
  if (c.local_started > 0 && c.local_with_detail < c.local_started) {
    out.push({
      id: 'coverage',
      tone: 'info',
      title: `${share(c.local_with_detail, c.local_started)}% dos torneios locais têm detalhes completos`,
      detail: 'O restante começou antes do arquivamento completo; o funil e a adoção os desconsideram.',
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

export function kpiCards(data: DashboardInsights): KpiCard[] {
  const { current, previous } = data.kpis;
  const started = data.series.map((day) => day.started);
  const finished = data.series.map((day) => day.finished);
  return [
    {
      key: 'started',
      label: 'Torneios iniciados',
      value: String(current.started),
      hint: `${current.finished} finalizados`,
      delta: kpiDelta(current.started, previous.started),
      spark: started,
    },
    {
      key: 'completion',
      label: 'Taxa de conclusão',
      value: current.completion_rate === null ? '—' : `${Math.round(current.completion_rate)}%`,
      hint: current.started ? `${current.finished} de ${current.started} iniciados` : 'Sem torneios iniciados',
      delta: kpiDelta(current.completion_rate, previous.completion_rate, 'pts'),
      spark: finished,
    },
    {
      key: 'players',
      label: 'Atletas',
      value: String(current.players),
      hint: current.avg_players ? `média de ${current.avg_players} por torneio` : 'Sem atletas',
      delta: kpiDelta(current.players, previous.players),
      spark: null,
    },
    {
      key: 'matches',
      label: 'Partidas lançadas',
      value: String(current.matches_scored),
      hint: 'Placares registrados',
      delta: kpiDelta(current.matches_scored, previous.matches_scored),
      spark: null,
    },
    {
      key: 'moderators',
      label: 'Moderadores ativos',
      value: String(current.moderators),
      hint: `${current.new_moderators} ${current.new_moderators === 1 ? 'novo' : 'novos'} no período`,
      delta: kpiDelta(current.moderators, previous.moderators),
      spark: null,
    },
    {
      key: 'duration',
      label: 'Duração mediana',
      value: formatDuration(data.duration.median_seconds),
      hint:
        data.duration.p90_seconds === null
          ? 'Sem torneios finalizados'
          : `9 em cada 10 terminam em até ${formatDuration(data.duration.p90_seconds)}`,
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
