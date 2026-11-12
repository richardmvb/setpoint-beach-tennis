const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const adminId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const sharedId = '10000000-0000-4000-8000-000000000001';
const localId = '20000000-0000-4000-8000-000000000001';
const database = new PGlite();

function state(name, scored, total, extra = {}) {
  return {
    name,
    size: 8,
    tournamentMode: 'super',
    startedAt: '2026-11-08T10:00:00Z',
    rounds: total
      ? [
          {
            matches: Array.from({ length: total }, (_, index) => ({
              scoreA: index < scored ? 4 : null,
              scoreB: index < scored ? 2 : null,
            })),
          },
        ]
      : [],
    ...extra,
  };
}

test.before(async () => {
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.setpoint_dashboard_admins (user_id uuid primary key);
    create table public.shared_tournaments (id uuid primary key, status text, state jsonb, updated_at timestamptz, started_at timestamptz);
    create table public.local_live_tournaments (id uuid primary key, status text, state jsonb, updated_at timestamptz);
    create table public.local_tournament_metrics (status text);
  `);
  await database.exec(
    fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611080001_dashboard_activity.sql'), 'utf8'),
  );
  await database.query('insert into public.setpoint_dashboard_admins values ($1)', [adminId]);
  await database.query('insert into public.shared_tournaments values ($1, $2, $3, now(), now())', [
    sharedId,
    'active',
    state('Ativo', 1, 4),
  ]);
  await database.query('insert into public.local_live_tournaments values ($1, $2, $3, now())', [
    localId,
    'active',
    state('Local', 2, 4),
  ]);
  const archived = [
    ['registration', state('Inscrição', 0, 0), false],
    ['no_scores', state('Sem placares', 0, 4), true],
    ['under_half', state('Início', 1, 4), true],
    ['over_half', state('Metade', 2, 4), true],
    ['rounds_complete', state('Rodadas', 4, 4), true],
    ['finals', state('Finais', 2, 4, { finals: { matches: [] } }), true],
    ['unknown', state('Sem tabela', 0, 0), true],
    ['finished', state('Finalizado', 4, 4, { finishedAt: '2026-11-08T12:00:00Z' }), true],
  ];
  for (const [index, [name, snapshot, started]] of archived.entries()) {
    const id = `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    await database.query('insert into public.shared_tournaments values ($1, $2, $3, now(), $4)', [
      id,
      'archived',
      snapshot,
      started ? '2026-11-08T10:00:00Z' : null,
    ]);
  }
  await database.exec("insert into public.local_tournament_metrics values ('abandoned'), ('started')");
});

test.after(async () => {
  await database.close();
});

test('administradores consultam torneios ativos, arquivados e etapas de abandono', async () => {
  const before = (
    await database.query('select status, state, updated_at from public.shared_tournaments where id = $1', [sharedId])
  ).rows[0];
  await database.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${adminId}', false)`);
  const { rows } = await database.query('select public.get_dashboard_activity() as activity');
  const activity = rows[0].activity;
  assert.equal(activity.active_tournaments.length, 2);
  assert.equal(activity.archived_tournaments.length, 8);
  assert.deepEqual(activity.active_tournaments.find((item) => item.id === sharedId).matches_completed, 1);
  assert.deepEqual(activity.active_tournaments.find((item) => item.id === localId).matches_total, 4);
  for (const stage of ['registration', 'no_scores', 'under_half', 'over_half', 'rounds_complete', 'finals']) {
    assert.equal(activity[`abandoned_${stage}`], 1, stage);
  }
  assert.equal(activity.abandoned_unknown, 2);
  const archiveId = '30000000-0000-4000-8000-000000000002';
  const archive = await database.query('select public.get_dashboard_tournament($1, $2) as snapshot', [
    'shared',
    archiveId,
  ]);
  assert.equal(archive.rows[0].snapshot.status, 'archived');
  assert.equal(archive.rows[0].snapshot.state.name, 'Sem placares');
  const local = await database.query('select public.get_dashboard_tournament($1, $2) as snapshot', ['local', localId]);
  assert.equal(local.rows[0].snapshot.state.name, 'Local');
  assert.ok(!JSON.stringify(activity).includes('token'));
  await database.exec('reset role');
  const after = (
    await database.query('select status, state, updated_at from public.shared_tournaments where id = $1', [sharedId])
  ).rows[0];
  assert.deepEqual(after, before);
  await database.exec('set role authenticated');
});

test('visitantes e usuários sem autorização não acessam métricas nem snapshots', async () => {
  await database.exec(`select set_config('request.jwt.claim.sub', '${otherId}', false)`);
  await assert.rejects(database.query('select public.get_dashboard_activity()'), /dashboard_admin_required/);
  await assert.rejects(
    database.query('select public.get_dashboard_tournament($1, $2)', ['shared', sharedId]),
    /dashboard_admin_required/,
  );
  await database.exec('reset role; set role anon');
  await assert.rejects(database.query('select public.get_dashboard_activity()'), /permission denied/);
  await assert.rejects(
    database.query('select public.get_dashboard_tournament($1, $2)', ['shared', sharedId]),
    /permission denied/,
  );
  await database.exec('reset role');
});
