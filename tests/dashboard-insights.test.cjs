const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const adminId = '00000000-0000-4000-8000-000000000001';
const o1 = '00000000-0000-4000-8000-0000000000a1';
const o2 = '00000000-0000-4000-8000-0000000000a2';
const o3 = '00000000-0000-4000-8000-0000000000a3';
const database = new PGlite();
const as = (user) => database.exec(`select set_config('request.jwt.claim.sub', '${user ?? ''}', false)`);

const DAY = 86400000;
const midnightUtc = (daysAgo) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysAgo));
};
const at = (daysAgo, hour) => new Date(midnightUtc(daysAgo).getTime() + hour * 3600000);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
const match = (a, b) => ({ scoreA: a, scoreB: b });
const rounds = (scored, total) => [
  { matches: Array.from({ length: total }, (_, i) => (i < scored ? match(4, 2) : match(null, null))) },
];
let seq = 0;
const uuid = () => `20000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const sharedIds = {};
async function shared(key, owner, capacity, status, createdAt, startedAt, state) {
  const id = uuid();
  sharedIds[key] = id;
  await database.query('insert into public.shared_tournaments values ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [
    id,
    owner,
    key,
    capacity,
    status,
    JSON.stringify(state),
    startedAt,
    createdAt,
  ]);
}
async function local(owner, mode, size, doubles, status, startedAt, finishedAt, participants, archiveState, liveId) {
  const id = uuid();
  await database.query('insert into public.local_tournament_metrics values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    id,
    owner,
    mode,
    size,
    doubles,
    status,
    startedAt,
    finishedAt,
    participants,
    startedAt,
  ]);
  if (archiveState)
    await database.query('insert into public.local_tournament_archives values ($1,$2,$3)', [
      id,
      liveId ?? null,
      JSON.stringify(archiveState),
    ]);
  return id;
}
const call = async (days = 30, tz = 'UTC') =>
  (await database.query('select public.get_dashboard_insights($1, $2) as value', [days, tz])).rows[0].value;

test.before(async () => {
  await database.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.setpoint_dashboard_admins (user_id uuid primary key);
    create table public.shared_tournaments (id uuid primary key, owner_id uuid, name text, capacity integer, status text, state jsonb, started_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table public.shared_tournament_participants (tournament_id uuid, role text, created_at timestamptz default now());
    create table public.local_tournament_metrics (tournament_id uuid primary key, owner_id uuid, tournament_mode text, tournament_size integer, doubles_format text, status text, started_at timestamptz, finished_at timestamptz, participant_count integer, created_at timestamptz);
    create table public.local_tournament_archives (tournament_id uuid primary key, live_tournament_id uuid, state jsonb);
  `);
  await database.exec(
    fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611090002_dashboard_insights.sql'), 'utf8'),
  );
  await database.exec(`insert into auth.users values ('${adminId}'), ('${o1}'), ('${o2}'), ('${o3}')`);
  await database.exec(`insert into public.setpoint_dashboard_admins values ('${adminId}')`);

  const s1Start = at(5, 15),
    s1End = new Date(s1Start.getTime() + 7200000);
  await shared('S1 concluído', o1, 8, 'completed', at(5, 12), s1Start, {
    tournamentMode: 'super',
    doublesFormat: 'open',
    qualificationStats: true,
    finishedAt: s1End.toISOString(),
    players: players(8),
    rounds: rounds(4, 4),
    finals: { matches: [{ livePoints: ['A', 'A'] }] },
  });
  await shared('S2 parado', o1, 12, 'archived', at(3, 12), at(3, 14), {
    tournamentMode: 'super',
    doublesFormat: 'open',
    qualificationStats: false,
    players: players(12),
    rounds: rounds(1, 4),
  });
  await shared('S3 inscrição', o2, 8, 'registration', at(2, 9), null, {
    tournamentMode: 'super',
    players: players(3),
    rounds: [],
  });
  await shared('S4 anterior', o2, 8, 'completed', at(41, 9), at(40, 10), {
    tournamentMode: 'super',
    doublesFormat: 'open',
    finishedAt: at(40, 12).toISOString(),
    players: players(8),
    rounds: rounds(4, 4),
  });
  await database.query(
    `insert into public.shared_tournament_participants values ($1,'moderator'),($1,'guest'),($1,'guest'),($1,'guest'),($1,'manual'),($2,'moderator'),($2,'guest')`,
    [sharedIds['S1 concluído'], sharedIds['S2 parado']],
  );

  const l1Start = at(10, 18);
  await local(
    o2,
    'super',
    8,
    'open',
    'completed',
    l1Start,
    new Date(l1Start.getTime() + 3600000),
    8,
    { tournamentMode: 'super', rounds: rounds(4, 4) },
    uuid(),
  );
  await local(o3, 'super', 24, 'mixed', 'started', at(1, 20), null, 24, null);
  await local(o3, 'groups', 8, 'open', 'completed', at(70, 10), at(70, 11), 8, null);
});
test.after(async () => {
  await database.close();
});

test('somente administradores consultam os insights e o período é limitado', async () => {
  await as(o1);
  await assert.rejects(call(), /dashboard_admin_required/);
  await as(null);
  await assert.rejects(call(), /dashboard_admin_required/);
  await as(adminId);
  assert.equal((await call(1)).series.length, 7, 'mínimo de 7 dias');
  assert.equal((await call(9999)).series.length, 365, 'máximo de 365 dias');
});

test('indicadores do período e comparação com o período anterior', async () => {
  const result = await call();
  assert.deepEqual(result.kpis.current, {
    started: 4,
    finished: 2,
    completion_rate: 50,
    players: 52,
    avg_players: 13,
    matches_scored: 9,
    moderators: 3,
    new_moderators: 1,
  });
  assert.equal(result.kpis.previous.started, 1);
  assert.equal(result.kpis.previous.finished, 1);
  assert.equal(result.kpis.previous.completion_rate, 100);
  assert.equal(result.period.days, 30);
});

test('duração usa mediana e p90, não a média', async () => {
  const { duration } = await call();
  assert.equal(duration.median_seconds, 5400);
  assert.equal(duration.p90_seconds, 6840);
});

test('série diária cobre todos os dias e soma os totais do período', async () => {
  const { series } = await call();
  assert.equal(series.length, 30);
  assert.equal(
    series.reduce((sum, day) => sum + day.started, 0),
    4,
  );
  assert.equal(
    series.reduce((sum, day) => sum + day.shared, 0),
    2,
  );
  assert.equal(
    series.reduce((sum, day) => sum + day.finished, 0),
    2,
  );
  assert.equal(series[series.length - 1].date, midnightUtc(0).toISOString().slice(0, 10));
});

test('mix de formatos e hospedagem', async () => {
  const { mix, formats } = await call();
  assert.deepEqual(mix.mode, { super: 4 });
  assert.deepEqual(mix.size, { 8: 2, 12: 1, 24: 1 });
  assert.deepEqual(mix.doubles, { open: 3, mixed: 1 });
  assert.deepEqual(mix.hosting, { shared: 2, local: 2 });
  const super8 = formats.find((row) => row.mode === 'super' && row.size === 8 && row.doubles === 'open');
  assert.deepEqual([super8.started, super8.finished], [3, 3], 'tabela de formatos é de todo o histórico');
});

test('funil só considera torneios com progresso conhecido', async () => {
  const { funnel } = await call();
  assert.deepEqual(funnel, {
    basis: 3,
    started: 3,
    with_scores: 3,
    half_played: 2,
    rounds_done: 2,
    reached_finals: 2,
    finished: 2,
  });
});

test('inscrição de compartilhados, convidados e cobertura dos locais', async () => {
  const result = await call();
  assert.deepEqual(result.registration, { created: 3, started: 2, expired: 0, avg_guests: 2.5 });
  assert.deepEqual(result.coverage, { local_started: 2, local_with_detail: 1 });
});

test('mapa de calor respeita o fuso horário', async () => {
  const utc = await call(30, 'UTC');
  const startOfS1 = at(5, 15);
  const cell = utc.heatmap.find((item) => item.dow === startOfS1.getUTCDay() && item.hour === 15);
  assert.ok(cell && cell.count >= 1);
  assert.equal(
    utc.heatmap.reduce((sum, item) => sum + item.count, 0),
    4,
  );
  const brazil = await call(30, 'America/Sao_Paulo');
  assert.equal(brazil.period.timezone, 'America/Sao_Paulo');
  assert.equal(
    brazil.heatmap.reduce((sum, item) => sum + item.count, 0),
    4,
  );
  assert.ok(
    brazil.heatmap.some((item) => item.hour === 12),
    'a 15h UTC vira 12h em São Paulo',
  );
});

test('adoção de recursos usa o denominador elegível de cada um', async () => {
  const { adoption } = await call();
  assert.deepEqual(adoption.live_link, { used: 3, of: 4 });
  assert.deepEqual(adoption.qualification, { used: 1, of: 2 });
  assert.deepEqual(adoption.early_finals, { used: 0, of: 0 });
  assert.deepEqual(adoption.point_by_point, { used: 1, of: 1 });
  assert.deepEqual(adoption.mixed_doubles, { used: 1, of: 4 });
  assert.deepEqual(adoption.fixed_pairs, { used: 0, of: 0 });
});

test('retenção separa moderadores novos e recorrentes', async () => {
  const { retention } = await call();
  assert.deepEqual(retention, {
    moderators_total: 3,
    one_time: 0,
    two: 3,
    three_plus: 0,
    active_new: 1,
    active_returning: 2,
  });
});
