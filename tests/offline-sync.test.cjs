const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

const source = fs.readFileSync(path.join(__dirname, '../src/app/core/offline-sync-queue.ts'), 'utf8');
const javascript = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }
}).outputText;
const queueExports = {};
new Function('exports', 'require', javascript)(queueExports, require);

test('a fila persiste e não perde uma edição mais recente durante o envio', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const queue = new queueExports.OfflineSyncQueue(storage);
  queue.initialize('shared', 'tournament', { name: 'base' });
  assert.equal(queue.stage('shared', 'tournament', { name: 'primeira' }), true);
  const sending = queue.read('shared', 'tournament');
  queue.stage('shared', 'tournament', { name: 'segunda' });
  assert.equal(queue.refreshBase('shared', 'tournament', { name: 'servidor' }), false);
  queue.acknowledge('shared', 'tournament', sending.revision, sending.pending);
  const restored = new queueExports.OfflineSyncQueue(storage).read('shared', 'tournament');
  assert.equal(restored.base.name, 'primeira');
  assert.equal(restored.pending.name, 'segunda');
  queue.acknowledge('shared', 'tournament', restored.revision, restored.pending);
  assert.equal(queue.read('shared', 'tournament').pending, null);
  assert.equal(queue.stage('local', 'missing', { name: 'sem base' }), false);
});

test('RPCs rejeitam conflitos e permitem repetir uma confirmação perdida', async () => {
  const database = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const sharedId = '10000000-0000-4000-8000-000000000001';
  const expiredId = '10000000-0000-4000-8000-000000000002';
  const lockedId = '10000000-0000-4000-8000-000000000003';
  const missingExpiryId = '10000000-0000-4000-8000-000000000004';
  const localId = '20000000-0000-4000-8000-000000000001';
  const token = 'a'.repeat(64);
  const base = { name: 'Torneio', rounds: [{ matches: [{ scoreA: null, scoreB: null }] }], finals: null };
  const updated = { ...base, rounds: [{ matches: [{ scoreA: 4, scoreB: 2 }] }] };
  try {
    await database.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function extensions.digest(text, text) returns bytea language sql immutable as $$ select convert_to($1, 'UTF8') $$;
      create table public.shared_tournaments (id uuid primary key, owner_id uuid, status text, state jsonb, capacity integer, invite_expires_at timestamptz, expires_at timestamptz, updated_at timestamptz);
      create table public.local_live_tournaments (id uuid primary key, owner_id uuid, status text, state jsonb, write_token_hash text, updated_at timestamptz);
    `);
    await database.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611080002_offline_sync.sql'), 'utf8'));
    await database.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now(),now()+interval '1 day',now())", [sharedId, owner, base]);
    await database.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now(),now()-interval '1 day',now())", [expiredId, owner, base]);
    await database.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now(),null,now())", [missingExpiryId, owner, base]);
    const locked = { ...base, finals: { matches: [] } };
    await database.query("insert into public.shared_tournaments values ($1,$2,'active',$3,8,now(),now()+interval '1 day',now())", [lockedId, owner, locked]);
    await database.query("insert into public.local_live_tournaments values ($1,$2,'active',$3,encode(extensions.digest($4,'sha256'),'hex'),now())", [localId, owner, base, token]);
    await database.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false)`);
    const shared = (await database.query('select public.sync_shared_tournament($1,$2,$3) as value', [sharedId, base, updated])).rows[0].value;
    assert.equal(shared.state.rounds[0].matches[0].scoreA, 4);
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [sharedId, base, { ...updated, name: 'conflito' }]), /sync_conflict/);
    const repeated = (await database.query('select public.sync_shared_tournament($1,$2,$3) as value', [sharedId, base, updated])).rows[0].value;
    assert.equal(repeated.state.rounds[0].matches[0].scoreA, 4);
    const finished = { ...updated, finishedAt: '2026-11-08T12:00:00Z' };
    assert.equal((await database.query('select public.sync_shared_tournament($1,$2,$3) as value', [sharedId, updated, finished])).rows[0].value.status, 'completed');
    assert.equal((await database.query('select public.sync_shared_tournament($1,$2,$3) as value', [sharedId, updated, finished])).rows[0].value.status, 'completed');
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [sharedId, finished, updated]), /moderator_only_or_tournament_expired/);
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [expiredId, base, updated]), /moderator_only_or_tournament_expired/);
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [missingExpiryId, base, updated]), /moderator_only_or_tournament_expired/);
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [lockedId, locked, { ...updated, finals: locked.finals }]), /rounds_locked/);
    assert.equal((await database.query('select public.sync_local_live_tournament($1,$2,$3) as value', [token, base, updated])).rows[0].value.state.rounds[0].matches[0].scoreA, 4);
    await assert.rejects(database.query('select public.sync_local_live_tournament($1,$2,$3)', [token, base, { ...updated, name: 'conflito' }]), /sync_conflict/);
    assert.equal((await database.query('select public.sync_local_live_tournament($1,$2,$3) as value', [token, base, updated])).rows[0].value.status, 'active');
    assert.equal((await database.query('select public.sync_local_live_tournament($1,$2,$3) as value', [token, updated, finished])).rows[0].value.status, 'completed');
    assert.equal((await database.query('select public.sync_local_live_tournament($1,$2,$3) as value', [token, updated, finished])).rows[0].value.status, 'completed');
    await assert.rejects(database.query('select public.sync_local_live_tournament($1,$2,$3)', [token, finished, updated]), /tournament_completed/);
    await database.exec(`select set_config('request.jwt.claim.sub', '${other}', false)`);
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [sharedId, updated, finished]), /moderator_only/);
    await assert.rejects(database.query('select public.sync_local_live_tournament($1,$2,$3)', [token, updated, finished]), /invalid_live_token/);
    await database.exec('reset role; set role anon');
    await assert.rejects(database.query('select public.sync_shared_tournament($1,$2,$3)', [sharedId, base, updated]), /permission denied/);
  } finally {
    await database.close();
  }
});