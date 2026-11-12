const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const { loadTs } = require('./support/load-ts.cjs');
const { FAKE_SUPABASE_SQL } = require('./support/fake-supabase.cjs');

const adminId = '00000000-0000-4000-8000-000000000001';
const ownerId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const archiveId = '40000000-0000-4000-8000-000000000001';
const liveId = '50000000-0000-4000-8000-000000000001';
const database = new PGlite();

const as = (user) => database.exec(`select set_config('request.jwt.claim.sub', '${user ?? ''}', false)`);
const tournament = (extra = {}) => ({
  name: 'Super de sábado',
  size: 8,
  tournamentMode: 'super',
  startedAt: '2026-11-09T09:00:00Z',
  analyticsId: archiveId,
  players: [
    { id: 'p1', name: 'Ana', photoDataUrl: 'data:image/webp;base64,AAAA' },
    { id: 'p2', name: 'Bia' },
  ],
  rounds: [
    {
      number: 1,
      restingPlayerIds: [],
      matches: [{ id: 'm1', court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], scoreA: 4, scoreB: 1 }],
    },
  ],
  ...extra,
});
const save = (state, id = archiveId, live = null) =>
  database.query('select public.save_local_tournament_archive($1, $2::jsonb, $3)', [id, JSON.stringify(state), live]);

test.before(async () => {
  await database.exec(`
    ${FAKE_SUPABASE_SQL}
    create table public.setpoint_dashboard_admins (user_id uuid primary key);
    create table public.shared_tournaments (id uuid primary key, status text, state jsonb);
    create table public.local_live_tournaments (id uuid primary key, status text, state jsonb);
  `);
  await database.exec(
    fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611090001_local_tournament_archives.sql'), 'utf8'),
  );
  await database.exec(`insert into auth.users values ('${adminId}'), ('${ownerId}'), ('${otherId}')`);
  await database.exec(`insert into public.setpoint_dashboard_admins values ('${adminId}')`);
  await database.query('insert into public.local_live_tournaments values ($1, $2, $3)', [
    liveId,
    'active',
    tournament({ name: 'Só ao vivo' }),
  ]);
});
test.after(async () => {
  await database.close();
});

test('guarda o torneio local completo, sem fotos nem identificador de métricas', async () => {
  await as(ownerId);
  await save(tournament());
  const row = (await database.query('select * from public.local_tournament_archives')).rows[0];
  assert.equal(row.owner_id, ownerId);
  assert.equal(row.status, 'active');
  assert.equal(row.state.rounds[0].matches[0].scoreA, 4);
  assert.deepEqual(
    row.state.players.map((player) => player.name),
    ['Ana', 'Bia'],
  );
  assert.equal(row.state.players[0].photoDataUrl, undefined);
  assert.equal(row.state.analyticsId, undefined);
});

test('reenvios atualizam a mesma linha e finalizar marca como concluído', async () => {
  await as(ownerId);
  await save(tournament({ finishedAt: '2026-11-09T11:00:00Z' }), archiveId, liveId);
  const rows = (
    await database.query('select status, finished_at, live_tournament_id from public.local_tournament_archives')
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'completed');
  assert.equal(rows[0].live_tournament_id, liveId);
  await save(tournament({ finishedAt: '2026-11-09T11:00:00Z' }));
  assert.equal(
    (await database.query('select live_tournament_id from public.local_tournament_archives')).rows[0]
      .live_tournament_id,
    liveId,
  );
});

test('outro usuário não sobrescreve e estados inválidos são rejeitados', async () => {
  await as(otherId);
  await assert.rejects(save(tournament({ name: 'Invasor' })), /archive_owner_mismatch/);
  await as(ownerId);
  await assert.rejects(
    save(tournament({ rounds: [] }), '40000000-0000-4000-8000-000000000002'),
    /invalid_tournament_state/,
  );
  await assert.rejects(
    save(tournament({ name: ' ' }), '40000000-0000-4000-8000-000000000002'),
    /invalid_tournament_state/,
  );
  await as(null);
  await assert.rejects(save(tournament()), /authentication_required/);
  assert.equal(
    (await database.query('select name from public.local_tournament_archives')).rows[0].name,
    'Super de sábado',
  );
});

test('administradores listam e reabrem o torneio com todos os detalhes; os demais não', async () => {
  await as(adminId);
  const list = (await database.query('select public.get_dashboard_local_archives() as value')).rows[0].value;
  assert.equal(list.length, 1);
  assert.deepEqual(
    [list[0].id, list[0].live_id, list[0].source, list[0].status],
    [archiveId, liveId, 'local', 'completed'],
  );
  assert.equal(list[0].matches_total, 1);
  assert.equal(list[0].matches_completed, 1);
  const opened = (await database.query("select public.get_dashboard_tournament('local', $1) as value", [archiveId]))
    .rows[0].value;
  assert.equal(opened.state.rounds[0].matches[0].scoreB, 1);
  const live = (await database.query("select public.get_dashboard_tournament('local', $1) as value", [liveId])).rows[0]
    .value;
  assert.equal(live.state.name, 'Só ao vivo');
  await as(ownerId);
  await assert.rejects(database.query('select public.get_dashboard_local_archives()'), /dashboard_admin_required/);
  await assert.rejects(
    database.query("select public.get_dashboard_tournament('local', $1)", [archiveId]),
    /dashboard_admin_required/,
  );
});

test('o dashboard exibe cada torneio uma vez: o arquivo completo substitui o link ao vivo', async () => {
  const typescript = require('typescript');
  const exported = loadTs(path.join(__dirname, '../src/app/core/supabase.service.ts'));
  const service = Object.create(exported.SupabaseService.prototype);
  const recent = new Date().toISOString();
  const old = '2026-01-01T00:00:00Z';
  const responses = {
    get_dashboard_activity: {
      active_tournaments: [
        { id: 'live', source: 'local', updated_at: recent },
        { id: 'shared', source: 'shared', updated_at: recent },
      ],
      archived_tournaments: [],
    },
    get_dashboard_archived_local_tournaments: [{ id: 'live-archived', source: 'local', updated_at: old }],
    get_dashboard_local_archives: [
      { id: 'archive-live', live_id: 'live', source: 'local', status: 'active', updated_at: recent },
      { id: 'archive-done', live_id: 'live-archived', source: 'local', status: 'completed', updated_at: old },
      { id: 'archive-stale', live_id: null, source: 'local', status: 'active', updated_at: old },
    ],
  };
  service.client = { rpc: async (name) => ({ data: responses[name], error: null }) };
  const merged = await service.getDashboardActivity();
  assert.deepEqual(merged.active_tournaments.map((item) => item.id).sort(), ['archive-live', 'shared']);
  assert.deepEqual(merged.archived_tournaments.map((item) => item.id).sort(), ['archive-done', 'archive-stale']);
});
