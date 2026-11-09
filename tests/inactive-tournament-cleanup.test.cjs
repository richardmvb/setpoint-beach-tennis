const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');
const typescript = require('typescript');

const migrationDir = path.join(__dirname, '../supabase/migrations');
const readMigration = name => fs.readFileSync(path.join(migrationDir, name), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const admin = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const sharedId = '10000000-0000-4000-8000-000000000001';
const recentId = '10000000-0000-4000-8000-000000000002';
const localId = '20000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);
const readToken = 'b'.repeat(64);
const state = { name: 'Teste', size: 8, rounds: [{ matches: [{ scoreA: 4, scoreB: 2 }] }], finals: null };

test('o worker arquiva por inatividade sem apagar resultados nem encerrar torneios ativos', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema extensions; create schema cron;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$ select decode(repeat('ab', $1), 'hex') $$;
      create function extensions.digest(bytea, text) returns bytea language sql immutable as $$ select $1 $$;
      create function extensions.digest(text, text) returns bytea language sql immutable as $$ select convert_to($1, 'UTF8') $$;
      create table cron.job(jobname text primary key, schedule text, command text);
      create function cron.schedule(text, text, text) returns bigint language sql as $$
        insert into cron.job values ($1, $2, $3) on conflict (jobname) do update
          set schedule = excluded.schedule, command = excluded.command returning 1::bigint
      $$;
      create table public.setpoint_dashboard_admins(user_id uuid primary key);
      create table public.shared_tournaments(
        id uuid primary key, owner_id uuid, status text, state jsonb, capacity integer,
        updated_at timestamptz, archived_at timestamptz, expires_at timestamptz,
        invite_token_hash text, invite_expires_at timestamptz
      );
      create table public.local_live_tournaments(
        id uuid primary key, owner_id uuid, status text, state jsonb, read_token_hash text,
        write_token_hash text, created_at timestamptz, updated_at timestamptz,
        constraint local_live_tournaments_status_check check(status in ('active', 'completed'))
      );
    `);
    await db.query('insert into public.setpoint_dashboard_admins values ($1)', [admin]);
    await db.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now()-interval '25 hours',null,now()-interval '1 hour','old',now())", [sharedId, owner, state]);
    await db.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now()-interval '1 hour',null,now()-interval '1 hour','recent',now())", [recentId, owner, state]);
    await db.query("insert into public.shared_tournaments values ('10000000-0000-4000-8000-000000000003',$1,'registration',$2,8,now()-interval '20 minutes',null,null,'registration',now()-interval '5 minutes')", [owner, state]);
    await db.query("insert into public.shared_tournaments values ('10000000-0000-4000-8000-000000000004',$1,'ready',$2,8,now()-interval '25 hours',null,null,'ready',now())", [owner, state]);
    await db.query("insert into public.shared_tournaments values ('10000000-0000-4000-8000-000000000005',$1,'completed',$2,8,now()-interval '25 hours',null,now()-interval '1 hour','completed',now())", [owner, { ...state, finishedAt: '2026-11-07T10:00:00Z' }]);
    await db.query("insert into public.shared_tournaments values ('10000000-0000-4000-8000-000000000006',$1,'active',$2,8,now()-interval '24 hours',null,now(),'boundary',now())", [owner, state]);
    await db.query("insert into public.shared_tournaments values ('10000000-0000-4000-8000-000000000007',$1,'active',$2,8,now()-interval '23 hours 59 minutes',null,now(),'not-yet',now())", [owner, state]);
    await db.query("insert into public.local_live_tournaments values ($1,$2,'active',$3,encode(extensions.digest($5,'sha256'),'hex'),encode(extensions.digest($4,'sha256'),'hex'),now()-interval '30 hours',now()-interval '25 hours')", [localId, owner, state, token, readToken]);
    await db.query("insert into public.local_live_tournaments values ('20000000-0000-4000-8000-000000000002',$1,'completed',$2,'read2','write2',now()-interval '30 hours',now()-interval '25 hours')", [owner, { ...state, finishedAt: '2026-11-07T10:00:00Z' }]);
    await db.query("insert into public.local_live_tournaments values ('20000000-0000-4000-8000-000000000003',$1,'active',$2,'read3','write3',now()-interval '30 hours',now()-interval '1 hour')", [owner, state]);
    await db.exec(readMigration('202611070002_local_live_spectator_links.sql'));
    await db.exec(readMigration('202611080002_offline_sync.sql'));
    await db.exec(readMigration('202611080003_archive_inactive_tournaments.sql'));
    await db.exec(readMigration('202611080003_archive_inactive_tournaments.sql'));
    const jobs = (await db.query('select * from cron.job')).rows;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].schedule, '*/5 * * * *');
    assert.equal(jobs[0].command, 'select public.cleanup_expired_shared_tournaments();');

    const before = (await db.query('select state, updated_at from public.shared_tournaments where id=$1', [sharedId])).rows[0];
    const backfilled = (await db.query("select expires_at > now() as available from public.shared_tournaments where id=$1", [recentId])).rows[0];
    assert.equal(backfilled.available, true);
    const count = (await db.query('select public.cleanup_expired_shared_tournaments() as archived')).rows[0].archived;
    assert.equal(count, 7);
    assert.equal((await db.query('select public.cleanup_expired_shared_tournaments() as archived')).rows[0].archived, 0);
    const archived = (await db.query('select status, state, updated_at, archived_at, invite_token_hash from public.shared_tournaments where id=$1', [sharedId])).rows[0];
    assert.equal(archived.status, 'archived');
    assert.deepEqual(archived.state, before.state);
    assert.equal(archived.state.finishedAt, undefined);
    assert.equal(+archived.updated_at, +before.updated_at);
    assert.ok(archived.archived_at);
    assert.notEqual(archived.invite_token_hash, 'old');
    assert.equal((await db.query('select status from public.local_live_tournaments where id=$1', [localId])).rows[0].status, 'archived');
    assert.equal((await db.query('select status from public.shared_tournaments where id=$1', [recentId])).rows[0].status, 'active');
    assert.equal((await db.query("select status from public.shared_tournaments where invite_token_hash='not-yet'")).rows[0].status, 'active');
    assert.equal((await db.query("select status from public.shared_tournaments where id='10000000-0000-4000-8000-000000000006'")).rows[0].status, 'archived');
    await db.exec('update public.shared_tournaments set updated_at=now() where id=\'10000000-0000-4000-8000-000000000002\'');
    assert.equal((await db.query("select expires_at >= updated_at + interval '24 hours' as extended from public.shared_tournaments where id=$1", [recentId])).rows[0].extended, true);

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false)`);
    const synced = (await db.query('select public.sync_shared_tournament($1,$2,$3) as item', [recentId, state, { ...state, name: 'Atualizado' }])).rows[0].item;
    assert.equal(synced.state.name, 'Atualizado');
    assert.ok(Date.parse(synced.expiresAt) > Date.now() + 23 * 60 * 60 * 1000);
    await assert.rejects(db.query('select public.sync_local_live_tournament($1,$2,$3)', [token, state, { ...state, name: 'Novo' }]), /tournament_archived/);
    await assert.rejects(db.query('select public.update_local_live_tournament($1,$2)', [token, { ...state, name: 'Novo' }]), /tournament_archived/);
    await assert.rejects(db.query('select public.sync_shared_tournament($1,$2,$3)', [sharedId, state, { ...state, name: 'Novo' }]), /moderator_only_or_tournament_expired/);
    await assert.rejects(db.query('select public.get_dashboard_archived_local_tournaments()'), /dashboard_admin_required/);
    await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false)`);
    const archives = (await db.query('select public.get_dashboard_archived_local_tournaments() as items')).rows[0].items;
    assert.equal(archives.length, 2);
    assert.equal(archives.find(item => item.id === localId).matches_completed, 1);
    const recovered = (await db.query('select public.get_dashboard_tournament($1,$2) as item', ['local', localId])).rows[0].item;
    assert.equal(recovered.status, 'archived');
    assert.deepEqual(recovered.state, state);
    assert.equal((await db.query('select public.get_dashboard_tournament($1,$2) as item', ['shared', sharedId])).rows[0].item.status, 'archived');
    await db.exec(`select set_config('request.jwt.claim.sub', '${outsider}', false)`);
    await assert.rejects(db.query('select public.get_dashboard_tournament($1,$2)', ['local', localId]), /dashboard_admin_required/);
    await db.exec('reset role; set role anon');
    assert.equal((await db.query('select public.get_local_live_tournament($1) as item', [readToken])).rows[0].item.status, 'archived');
    await assert.rejects(db.query('select public.cleanup_expired_shared_tournaments()'), /permission denied/);
    await assert.rejects(db.query('select public.get_dashboard_archived_local_tournaments()'), /permission denied/);
  } finally {
    await db.close();
  }
});

test('o job existente executa a rotina de limpeza a cada cinco minutos', () => {
  const initialMigration = readMigration('202610310001_shared_tournaments.sql');
  assert.match(initialMigration, /cron\.schedule\([\s\S]*?'cleanup-setpoint-shared-tournaments'[\s\S]*?'\*\/5 \* \* \* \*'[\s\S]*?cleanup_expired_shared_tournaments\(\)/);
});

test('o dashboard mescla arquivos locais e mantém compatibilidade antes da migration', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/core/supabase.service.ts'), 'utf8');
  const javascript = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText;
  const exports = {};
  new Function('require', 'exports', javascript)(name => {
    if (name === '@angular/core') return { Injectable: () => target => target };
    if (name === '@supabase/supabase-js') return {};
    return require(name);
  }, exports);
  const service = Object.create(exports.SupabaseService.prototype);
  const base = { active_tournaments: [], archived_tournaments: [{ id: 'shared', updated_at: '2026-11-07T10:00:00Z' }] };
  let migrationInstalled = true;
  service.client = {
    rpc: async name => name === 'get_dashboard_activity' ? { data: base, error: null }
      : name === 'get_dashboard_local_archives' ? { data: [], error: null }
      : migrationInstalled
        ? { data: [{ id: 'local', updated_at: '2026-11-08T10:00:00Z' }], error: null }
        : { data: null, error: { code: 'PGRST202' } }
  };
  const merged = await service.getDashboardActivity();
  assert.deepEqual(merged.archived_tournaments.map(item => item.id), ['local', 'shared']);
  assert.equal(merged.local_archives_available, true);
  migrationInstalled = false;
  const legacy = await service.getDashboardActivity();
  assert.deepEqual(legacy.archived_tournaments.map(item => item.id), ['shared']);
  assert.equal(legacy.local_archives_available, false);
});