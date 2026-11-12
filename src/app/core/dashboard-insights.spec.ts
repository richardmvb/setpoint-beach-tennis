import { describe, expect, it } from 'vitest';
import * as model from './dashboard-insights';
import type { DashboardInsights, Insight } from './dashboard-insights';

type KpiSet = DashboardInsights['kpis']['current'];

const kpi = (over: Partial<KpiSet> = {}): KpiSet => ({
  started: 10,
  finished: 6,
  completion_rate: 60,
  players: 90,
  avg_players: 9,
  matches_scored: 120,
  moderators: 5,
  new_moderators: 2,
  ...over,
});
const data = (over: Partial<DashboardInsights> = {}): DashboardInsights => ({
  period: { days: 30, from: '', to: '', timezone: 'UTC' },
  kpis: { current: kpi(), previous: kpi() },
  duration: { median_seconds: 5400, p90_seconds: 9000 },
  series: [],
  mix: {
    mode: { super: 10 },
    size: { 8: 5, 12: 3, 24: 2 },
    doubles: { open: 8, mixed: 2 },
    hosting: { shared: 5, local: 5 },
  },
  formats: [],
  funnel: { basis: 10, started: 10, with_scores: 9, half_played: 8, rounds_done: 7, reached_finals: 6, finished: 6 },
  registration: { created: 5, started: 4, expired: 1, avg_guests: 6 },
  heatmap: [],
  adoption: {
    live_link: { used: 5, of: 10 },
    qualification: { used: 3, of: 5 },
    early_finals: { used: 0, of: 0 },
    point_by_point: { used: 2, of: 6 },
    mixed_doubles: { used: 2, of: 10 },
    fixed_pairs: { used: 0, of: 0 },
  },
  retention: { moderators_total: 10, one_time: 4, two: 4, three_plus: 2, active_new: 2, active_returning: 3 },
  coverage: { local_started: 5, local_with_detail: 5 },
  generated_at: '',
  ...over,
});
const ids = (list: Insight[]): string[] => list.map((item) => item.id);

describe('dashboard insights model', () => {
  it('variação nunca inventa porcentagem sobre base zero', () => {
    expect(model.kpiDelta(10, 0)).toStrictEqual({ direction: 'new', percent: null, label: 'novo' });
    expect(model.kpiDelta(0, 0).direction).toBe('flat');
    expect(model.kpiDelta(12, 10)).toStrictEqual({ direction: 'up', percent: 20, label: '+20%' });
    expect(model.kpiDelta(5, 10)).toStrictEqual({ direction: 'down', percent: -50, label: '-50%' });
    expect(model.kpiDelta(null, 10).direction).toBe('none');
    expect(model.kpiDelta(70.5, 60, 'pts')).toStrictEqual({ direction: 'up', percent: 10.5, label: '+10.5 pts' });
  });

  it('funil calcula a conversão sobre o início e sobre a etapa anterior', () => {
    const steps = model.funnelSteps(data().funnel);
    expect(steps.length).toBe(6);
    expect([steps[1].ofStart, steps[1].ofPrevious]).toStrictEqual([90, 90]);
    expect([steps[5].ofStart, steps[5].ofPrevious]).toStrictEqual([60, 100]);
    expect(
      model
        .funnelSteps({
          basis: 0,
          started: 0,
          with_scores: 0,
          half_played: 0,
          rounds_done: 0,
          reached_finals: 0,
          finished: 0,
        })
        .map((s) => s.ofStart),
    ).toStrictEqual([0, 0, 0, 0, 0, 0]);
  });

  it('mapa de calor começa na segunda-feira e encontra o pico', () => {
    const grid = model.heatmapGrid([
      { dow: 0, hour: 9, count: 1 },
      { dow: 6, hour: 19, count: 4 },
      { dow: 1, hour: 19, count: 2 },
    ]);
    expect(grid.rows.length).toBe(7);
    expect(grid.rows[6][9], 'domingo vira a última linha').toBe(1);
    expect(grid.rows[5][19], 'sábado é a sexta linha').toBe(4);
    expect(grid.rows[0][19], 'segunda é a primeira').toBe(2);
    expect(grid.peak).toStrictEqual({ dow: 6, hour: 19, count: 4 });
    expect(grid.max).toBe(4);
  });

  it('insights de volume: crescimento, queda, estabilidade e primeiro uso', () => {
    const volume = (cur: number, prev: number) =>
      model
        .buildInsights(data({ kpis: { current: kpi({ started: cur }), previous: kpi({ started: prev }) } }))
        .find((i) => i.id === 'volume');
    expect(volume(15, 10)?.tone).toBe('good');
    expect(volume(15, 10)?.title).toMatch(/cresceu 50%/);
    expect(volume(6, 10)?.tone).toBe('warn');
    expect(volume(6, 10)?.title).toMatch(/caiu 40%/);
    expect(volume(10, 10)?.tone).toBe('info');
    expect(volume(4, 0)?.title).toMatch(/Primeiros torneios/);
  });

  it('conclusão baixa e queda do funil viram alertas; amostra pequena não alerta', () => {
    const weak = model.buildInsights(
      data({
        kpis: { current: kpi({ started: 10, finished: 2, completion_rate: 20 }), previous: kpi() },
        funnel: {
          basis: 10,
          started: 10,
          with_scores: 5,
          half_played: 4,
          rounds_done: 3,
          reached_finals: 2,
          finished: 2,
        },
      }),
    );
    expect(ids(weak)).toContain('completion');
    expect(weak.find((i) => i.id === 'completion')?.tone).toBe('warn');
    const funnel = weak.find((i) => i.id === 'funnel');
    expect(funnel?.title).toMatch(/50% se perdem entre “Iniciaram” e “Lançaram o 1º placar”/);
    expect(funnel?.detail).toMatch(/primeiro placar/);
    const tiny = model.buildInsights(
      data({
        kpis: { current: kpi({ started: 2, finished: 0, completion_rate: 0 }), previous: kpi({ started: 2 }) },
        funnel: {
          basis: 2,
          started: 2,
          with_scores: 0,
          half_played: 0,
          rounds_done: 0,
          reached_finals: 0,
          finished: 0,
        },
      }),
    );
    expect(ids(tiny)).not.toContain('completion');
    expect(ids(tiny)).not.toContain('funnel');
  });

  it('formato, pico, retenção, adoção e hospedagem aparecem somente com amostra suficiente', () => {
    const rich = model.buildInsights(
      data({
        mix: {
          mode: { super: 10 },
          size: { 8: 6, 12: 3, 24: 1 },
          doubles: { open: 9, mixed: 1 },
          hosting: { shared: 1, local: 9 },
        },
        heatmap: [{ dow: 6, hour: 19, count: 5 }],
        retention: { moderators_total: 10, one_time: 8, two: 1, three_plus: 1, active_new: 4, active_returning: 1 },
        adoption: { ...data().adoption, qualification: { used: 1, of: 8 } },
      }),
    );
    expect(rich.find((i) => i.id === 'format')?.title).toMatch(/Super 8 é o formato mais usado/);
    expect(rich.find((i) => i.id === 'peak')?.title).toMatch(/sábados às 19h/);
    expect(rich.find((i) => i.id === 'retention')?.title).toMatch(/Só 20% dos moderadores voltam/);
    expect(rich.find((i) => i.id === 'qualification')?.title).toMatch(/em só 13%/);
    expect(rich.find((i) => i.id === 'hosting')?.title).toMatch(/só 10%/);
    const sparse = model.buildInsights(
      data({
        retention: { moderators_total: 2, one_time: 2, two: 0, three_plus: 0, active_new: 2, active_returning: 0 },
        adoption: { ...data().adoption, qualification: { used: 0, of: 1 } },
        mix: { mode: { super: 3 }, size: { 8: 3 }, doubles: { open: 3 }, hosting: { shared: 0, local: 3 } },
      }),
    );
    for (const id of ['retention', 'qualification', 'format', 'hosting'])
      expect(ids(sparse).includes(id), id).toBe(false);
  });

  it('alertas vêm primeiro e a lista nunca passa de seis itens', () => {
    const list = model.buildInsights(
      data({
        kpis: { current: kpi({ started: 5, finished: 1, completion_rate: 20 }), previous: kpi({ started: 10 }) },
        heatmap: [{ dow: 5, hour: 20, count: 3 }],
        coverage: { local_started: 4, local_with_detail: 1 },
        mix: {
          mode: { super: 10 },
          size: { 8: 6, 12: 3, 24: 1 },
          doubles: { open: 9, mixed: 1 },
          hosting: { shared: 1, local: 9 },
        },
        retention: { moderators_total: 10, one_time: 8, two: 1, three_plus: 1, active_new: 4, active_returning: 1 },
      }),
      { label: 'Antes do primeiro placar', count: 4 },
    );
    expect(list.length).toBe(6);
    expect(list[0].tone).toBe('warn');
    const rank = { warn: 0, good: 1, info: 2 };
    const tones = list.map((i) => rank[i.tone]);
    expect(tones).toStrictEqual([...tones].sort((a, b) => a - b));
  });

  it('maior parada e cobertura de dados aparecem quando não há nada mais urgente', () => {
    // Neutral numbers on purpose: nothing here should trigger a rule other than the two under test.
    const quiet: Partial<DashboardInsights> = {
      kpis: { current: kpi({ started: 5, finished: 3, completion_rate: 60 }), previous: kpi({ started: 5 }) },
      funnel: { basis: 5, started: 5, with_scores: 5, half_played: 5, rounds_done: 5, reached_finals: 5, finished: 5 },
      mix: {
        mode: { super: 8 },
        size: { 8: 3, 12: 3, 24: 2 },
        doubles: { open: 6, mixed: 2 },
        hosting: { shared: 4, local: 4 },
      },
      retention: { moderators_total: 10, one_time: 6, two: 3, three_plus: 1, active_new: 2, active_returning: 3 },
      adoption: { ...data().adoption, qualification: { used: 2, of: 5 }, point_by_point: { used: 1, of: 6 } },
    };
    const list = model.buildInsights(data({ ...quiet, coverage: { local_started: 4, local_with_detail: 1 } }), {
      label: 'Antes do primeiro placar',
      count: 4,
    });
    expect(list.find((i) => i.id === 'dropoff')?.title).toMatch(/antes do primeiro placar/);
    expect(list.find((i) => i.id === 'coverage')?.title).toMatch(/25% dos torneios locais/);
    expect(
      ids(model.buildInsights(data(quiet), { label: 'x', count: 2 })).includes('dropoff'),
      'poucas paradas não viram insight',
    ).toBe(false);
  });

  it('rótulos e duração', () => {
    expect(model.formatLabel('super', 24, 'mixed')).toBe('Super 24 misto');
    expect(model.formatLabel('groups', 12, 'open')).toBe('Grupos 12');
    expect(model.formatDuration(5400)).toBe('1h30');
    expect(model.formatDuration(1500)).toBe('25 min');
    expect(model.formatDuration(7200)).toBe('2h');
    expect(model.formatDuration(null)).toBe('—');
  });

  it('cartões de indicadores trazem valor, dica e variação', () => {
    const cards = model.kpiCards(
      data({
        kpis: {
          current: kpi({
            started: 12,
            finished: 9,
            completion_rate: 75,
            players: 108,
            avg_players: 9,
            matches_scored: 200,
            moderators: 6,
            new_moderators: 1,
          }),
          previous: kpi({ started: 10, completion_rate: 60 }),
        },
        series: [
          { date: '2026-11-01', started: 2, shared: 1, finished: 1 },
          { date: '2026-11-02', started: 0, shared: 0, finished: 3 },
        ],
      }),
    );
    expect(cards.map((c) => c.key)).toStrictEqual([
      'started',
      'completion',
      'players',
      'matches',
      'moderators',
      'duration',
    ]);
    expect(cards[0].value).toBe('12');
    expect(cards[0].delta.label).toBe('+20%');
    expect(cards[0].spark).toStrictEqual([2, 0]);
    expect(cards[1].value).toBe('75%');
    expect(cards[1].delta.label).toBe('+15 pts');
    expect(cards[2].hint).toMatch(/média de 9/);
    expect(cards[4].hint).toMatch(/1 novo no/);
    expect(cards[5].value).toBe('1h30');
    expect(cards[5].hint).toMatch(/2h30/);
  });

  it('gráfico de tendência escala as barras pelo maior valor e rotula início, meio e fim', () => {
    const series = [
      { date: '2026-11-01', started: 4, shared: 0, finished: 0 },
      { date: '2026-11-02', started: 0, shared: 0, finished: 2 },
      { date: '2026-11-03', started: 2, shared: 0, finished: 4 },
    ];
    const chart = model.trendChart(series, 300, 100);
    expect(chart.max).toBe(4);
    expect(chart.bars.length).toBe(3);
    expect(chart.bars[0].height, 'o maior valor ocupa a altura útil').toBe(94);
    expect(chart.bars[1].height, 'dia sem torneio não desenha barra').toBe(0);
    expect(chart.bars[2].height).toBe(47);
    expect(chart.bars[0].y + chart.bars[0].height, 'barras ancoradas na base').toBe(100);
    expect(chart.labels.map((l) => l.text)).toStrictEqual(['01/11', '02/11', '03/11']);
    expect(
      chart.labels.map((l) => l.anchor),
      'extremos alinhados às bordas para não cortar o texto',
    ).toStrictEqual(['start', 'middle', 'end']);
    expect(chart.height).toBe(100);
    expect(chart.finishedLine.split(' ').length).toBe(3);
    expect(model.trendChart([], 300, 100).bars).toStrictEqual([]);
  });
});
