const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const model = loadCore('dashboard-insights');

const kpi = (over = {}) => ({
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
const data = (over = {}) => ({
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
const ids = (list) => list.map((item) => item.id);

test('variação nunca inventa porcentagem sobre base zero', () => {
  assert.deepEqual(model.kpiDelta(10, 0), { direction: 'new', percent: null, label: 'novo' });
  assert.equal(model.kpiDelta(0, 0).direction, 'flat');
  assert.deepEqual(model.kpiDelta(12, 10), { direction: 'up', percent: 20, label: '+20%' });
  assert.deepEqual(model.kpiDelta(5, 10), { direction: 'down', percent: -50, label: '-50%' });
  assert.equal(model.kpiDelta(null, 10).direction, 'none');
  assert.deepEqual(model.kpiDelta(70.5, 60, 'pts'), { direction: 'up', percent: 10.5, label: '+10.5 pts' });
});

test('funil calcula a conversão sobre o início e sobre a etapa anterior', () => {
  const steps = model.funnelSteps(data().funnel);
  assert.equal(steps.length, 6);
  assert.deepEqual([steps[1].ofStart, steps[1].ofPrevious], [90, 90]);
  assert.deepEqual([steps[5].ofStart, steps[5].ofPrevious], [60, 100]);
  assert.deepEqual(
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
    [0, 0, 0, 0, 0, 0],
  );
});

test('mapa de calor começa na segunda-feira e encontra o pico', () => {
  const grid = model.heatmapGrid([
    { dow: 0, hour: 9, count: 1 },
    { dow: 6, hour: 19, count: 4 },
    { dow: 1, hour: 19, count: 2 },
  ]);
  assert.equal(grid.rows.length, 7);
  assert.equal(grid.rows[6][9], 1, 'domingo vira a última linha');
  assert.equal(grid.rows[5][19], 4, 'sábado é a sexta linha');
  assert.equal(grid.rows[0][19], 2, 'segunda é a primeira');
  assert.deepEqual(grid.peak, { dow: 6, hour: 19, count: 4 });
  assert.equal(grid.max, 4);
});

test('insights de volume: crescimento, queda, estabilidade e primeiro uso', () => {
  const volume = (cur, prev) =>
    model
      .buildInsights(data({ kpis: { current: kpi({ started: cur }), previous: kpi({ started: prev }) } }))
      .find((i) => i.id === 'volume');
  assert.equal(volume(15, 10).tone, 'good');
  assert.match(volume(15, 10).title, /cresceu 50%/);
  assert.equal(volume(6, 10).tone, 'warn');
  assert.match(volume(6, 10).title, /caiu 40%/);
  assert.equal(volume(10, 10).tone, 'info');
  assert.match(volume(4, 0).title, /Primeiros torneios/);
});

test('conclusão baixa e queda do funil viram alertas; amostra pequena não alerta', () => {
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
  assert.ok(ids(weak).includes('completion'));
  assert.equal(weak.find((i) => i.id === 'completion').tone, 'warn');
  const funnel = weak.find((i) => i.id === 'funnel');
  assert.match(funnel.title, /50% se perdem entre “Iniciaram” e “Lançaram o 1º placar”/);
  assert.match(funnel.detail, /primeiro placar/);
  const tiny = model.buildInsights(
    data({
      kpis: { current: kpi({ started: 2, finished: 0, completion_rate: 0 }), previous: kpi({ started: 2 }) },
      funnel: { basis: 2, started: 2, with_scores: 0, half_played: 0, rounds_done: 0, reached_finals: 0, finished: 0 },
    }),
  );
  assert.ok(!ids(tiny).includes('completion') && !ids(tiny).includes('funnel'));
});

test('formato, pico, retenção, adoção e hospedagem aparecem somente com amostra suficiente', () => {
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
  assert.match(rich.find((i) => i.id === 'format').title, /Super 8 é o formato mais usado/);
  assert.match(rich.find((i) => i.id === 'peak').title, /sábados às 19h/);
  assert.match(rich.find((i) => i.id === 'retention').title, /Só 20% dos moderadores voltam/);
  assert.match(rich.find((i) => i.id === 'qualification').title, /em só 13%/);
  assert.match(rich.find((i) => i.id === 'hosting').title, /só 10%/);
  const sparse = model.buildInsights(
    data({
      retention: { moderators_total: 2, one_time: 2, two: 0, three_plus: 0, active_new: 2, active_returning: 0 },
      adoption: { ...data().adoption, qualification: { used: 0, of: 1 } },
      mix: { mode: { super: 3 }, size: { 8: 3 }, doubles: { open: 3 }, hosting: { shared: 0, local: 3 } },
    }),
  );
  for (const id of ['retention', 'qualification', 'format', 'hosting']) assert.ok(!ids(sparse).includes(id), id);
});

test('alertas vêm primeiro e a lista nunca passa de seis itens', () => {
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
  assert.equal(list.length, 6);
  assert.equal(list[0].tone, 'warn');
  const rank = { warn: 0, good: 1, info: 2 };
  const tones = list.map((i) => rank[i.tone]);
  assert.deepEqual(
    tones,
    [...tones].sort((a, b) => a - b),
  );
});

test('maior parada e cobertura de dados aparecem quando não há nada mais urgente', () => {
  // Neutral numbers on purpose: nothing here should trigger a rule other than the two under test.
  const quiet = {
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
  assert.match(list.find((i) => i.id === 'dropoff').title, /antes do primeiro placar/);
  assert.match(list.find((i) => i.id === 'coverage').title, /25% dos torneios locais/);
  assert.ok(
    !ids(model.buildInsights(data(quiet), { label: 'x', count: 2 })).includes('dropoff'),
    'poucas paradas não viram insight',
  );
});

test('rótulos e duração', () => {
  assert.equal(model.formatLabel('super', 24, 'mixed'), 'Super 24 misto');
  assert.equal(model.formatLabel('groups', 12, 'open'), 'Grupos 12');
  assert.equal(model.formatDuration(5400), '1h30');
  assert.equal(model.formatDuration(1500), '25 min');
  assert.equal(model.formatDuration(7200), '2h');
  assert.equal(model.formatDuration(null), '—');
});

test('cartões de indicadores trazem valor, dica e variação', () => {
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
  assert.deepEqual(
    cards.map((c) => c.key),
    ['started', 'completion', 'players', 'matches', 'moderators', 'duration'],
  );
  assert.equal(cards[0].value, '12');
  assert.equal(cards[0].delta.label, '+20%');
  assert.deepEqual(cards[0].spark, [2, 0]);
  assert.equal(cards[1].value, '75%');
  assert.equal(cards[1].delta.label, '+15 pts');
  assert.match(cards[2].hint, /média de 9/);
  assert.match(cards[4].hint, /1 novo no/);
  assert.equal(cards[5].value, '1h30');
  assert.match(cards[5].hint, /2h30/);
});

test('gráfico de tendência escala as barras pelo maior valor e rotula início, meio e fim', () => {
  const series = [
    { date: '2026-11-01', started: 4, shared: 0, finished: 0 },
    { date: '2026-11-02', started: 0, shared: 0, finished: 2 },
    { date: '2026-11-03', started: 2, shared: 0, finished: 4 },
  ];
  const chart = model.trendChart(series, 300, 100);
  assert.equal(chart.max, 4);
  assert.equal(chart.bars.length, 3);
  assert.equal(chart.bars[0].height, 94, 'o maior valor ocupa a altura útil');
  assert.equal(chart.bars[1].height, 0, 'dia sem torneio não desenha barra');
  assert.equal(chart.bars[2].height, 47);
  assert.equal(chart.bars[0].y + chart.bars[0].height, 100, 'barras ancoradas na base');
  assert.deepEqual(
    chart.labels.map((l) => l.text),
    ['01/11', '02/11', '03/11'],
  );
  assert.deepEqual(
    chart.labels.map((l) => l.anchor),
    ['start', 'middle', 'end'],
    'extremos alinhados às bordas para não cortar o texto',
  );
  assert.equal(chart.height, 100);
  assert.equal(chart.finishedLine.split(' ').length, 3);
  assert.deepEqual(model.trendChart([], 300, 100).bars, []);
});
