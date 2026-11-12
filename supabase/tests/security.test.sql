-- Security invariants and negative permission tests. Run with: npx supabase test db
-- Runs against the real local Supabase stack (real roles, grants and auth.uid()), not a fake.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------- invariants (#11)
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (not c.relrowsecurity
           or not exists (select 1 from pg_policy p where p.polrelid = c.oid))),
  '',
  'every public table has RLS enabled and at least one policy');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '',
  'every SECURITY DEFINER function pins search_path');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('public', p.oid, 'execute')),
  '',
  'no public function is executable by PUBLIC');

-- Exact allowlists: adding a function that anon or authenticated can run must be a reviewed change here.
select is(
  (select coalesce(string_agg(p.proname || '/' || p.pronargs, ', ' order by p.proname, p.pronargs), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'get_local_live_tournament/1, get_shared_tournament/1, join_shared_tournament/3, join_shared_tournament/4, join_shared_tournament/5',
  'anon can execute only the spectator reads and the invite join');

select is(
  (select coalesce(string_agg(p.proname || '/' || p.pronargs, ', ' order by p.proname, p.pronargs), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  'add_shared_participant/2, add_shared_participant/3, add_shared_participant/4, cancel_shared_tournament/1, create_local_live_tournament/1, create_shared_tournament/4, create_shared_tournament/5, get_dashboard_activity/0, get_dashboard_archived_local_tournaments/0, get_dashboard_insights/2, get_dashboard_local_archives/0, get_dashboard_metrics/0, get_dashboard_tournament/2, get_local_live_tournament/1, get_owned_shared_tournament/1, get_shared_tournament/1, join_shared_tournament/3, join_shared_tournament/4, join_shared_tournament/5, record_local_tournament_metrics/11, remove_shared_participant/2, rotate_shared_invite/1, save_local_tournament_archive/3, save_shared_tournament/2, start_shared_tournament/2, sync_local_live_tournament/3, sync_shared_tournament/3, update_local_live_tournament/2',
  'authenticated can execute only the documented RPCs');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('cleanup_expired_shared_tournaments', 'refresh_shared_tournament_expiry', 'prevent_archived_local_live_updates')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'maintenance and trigger functions are not callable from the API');

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated');

create temp table fixture (key text primary key, value text);
grant all on fixture to anon, authenticated;

create function pg_temp.act_as(p_uid text, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role, 'is_anonymous', true)::text, true);
  execute format('set local role %I', p_role);
end $$;
grant execute on function pg_temp.act_as(text, text) to anon, authenticated;

-- Owner A creates a tournament (anonymous-session user, like the real app).
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into fixture
select 'tid', (public.create_shared_tournament('Torneio A', 8, 'Ana', '{"size":8}'::jsonb, 'female')->>'id');
reset role;

select is((select count(*)::int from public.shared_tournaments), 1, 'owner A created one tournament');

-- ---------------------------------------------------------------- anon (no session)
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1', 'anon');
select throws_ok($$select public.create_shared_tournament('X', 8, 'Y', '{"size":8}'::jsonb, 'male')$$, '42501', null, 'anon cannot create a tournament');
select throws_ok($$select public.get_dashboard_metrics()$$, '42501', null, 'anon cannot read dashboard metrics');
select throws_ok($$select public.get_owned_shared_tournament(gen_random_uuid())$$, '42501', null, 'anon cannot read an owned tournament');
select throws_ok($$select public.rotate_shared_invite(gen_random_uuid())$$, '42501', null, 'anon cannot rotate an invite');
select throws_ok($$select public.record_local_tournament_metrics(gen_random_uuid(), 'a', 'b', 1, 1, 1, 1, 1, now(), now(), false)$$, '42501', null, 'anon cannot record metrics');
select throws_ok($$select * from public.shared_tournaments$$, '42501', null, 'anon cannot select tournaments directly');
select throws_ok($$insert into public.shared_tournaments (id) values (gen_random_uuid())$$, '42501', null, 'anon cannot insert tournaments directly');
select throws_ok($$select public.get_shared_tournament('short')$$, 'P0001', 'invalid_invite', 'anon spectator read rejects a malformed token');
select throws_ok($$select public.get_local_live_tournament('short')$$, 'P0001', 'invalid_live_link', 'anon live read rejects a malformed token');
select throws_ok($$select public.join_shared_tournament(repeat('a', 64), 'Zed', 'male', gen_random_uuid())$$, 'P0001', 'invalid_invite', 'anon join with an unknown invite fails');
reset role;

-- ---------------------------------------------------------------- authenticated, wrong user
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
select throws_ok($$select * from public.shared_tournaments$$, '42501', null, 'signed-in user cannot select tournaments directly');
select throws_ok($$select * from public.setpoint_dashboard_admins$$, '42501', null, 'signed-in user cannot read the admin list');
select throws_ok($$select public.get_dashboard_metrics()$$, 'P0001', 'dashboard_admin_required', 'non-admin cannot read dashboard metrics');
select throws_ok($$select public.get_dashboard_activity()$$, 'P0001', 'dashboard_admin_required', 'non-admin cannot read dashboard activity');
select throws_ok($$select public.get_dashboard_insights(30, 'all')$$, 'P0001', 'dashboard_admin_required', 'non-admin cannot read dashboard insights');
select throws_ok(
  format($f$select public.rotate_shared_invite(%L::uuid)$f$, (select value from fixture where key = 'tid')),
  'P0001', null, 'user B cannot rotate the invite of user A''s tournament');
select throws_ok(
  format($f$select public.cancel_shared_tournament(%L::uuid)$f$, (select value from fixture where key = 'tid')),
  'P0001', null, 'user B cannot cancel user A''s tournament');
select throws_ok(
  format($f$select public.get_owned_shared_tournament(%L::uuid)$f$, (select value from fixture where key = 'tid')),
  'P0001', null, 'user B cannot read user A''s tournament as owner');
select throws_ok(
  format($f$select public.add_shared_participant(%L::uuid, 'Intruder', 'male')$f$, (select value from fixture where key = 'tid')),
  'P0001', null, 'user B cannot add participants to user A''s tournament');
select throws_ok($$select public.sync_local_live_tournament(repeat('a', 64), '{}'::jsonb, '[]'::jsonb)$$, 'P0001', null, 'a made-up live write token is rejected');
reset role;

-- ---------------------------------------------------------------- owner and dashboard admin
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok(
  format($f$select public.get_owned_shared_tournament(%L::uuid)$f$, (select value from fixture where key = 'tid')),
  'owner A can read their own tournament');
reset role;

insert into public.setpoint_dashboard_admins (user_id) values ('00000000-0000-4000-8000-0000000000b2');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
select lives_ok($$select public.get_dashboard_metrics()$$, 'a listed admin can read dashboard metrics');
reset role;

-- ---------------------------------------------------------------- vendor isolation helper (#25)
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(app.current_user_id()::text, '00000000-0000-4000-8000-0000000000a1', 'app.current_user_id() returns the caller');
reset role;

-- ---------------------------------------------------------------- abuse limits
insert into public.local_live_tournaments (owner_id, read_token_hash, write_token_hash, state)
select '00000000-0000-4000-8000-0000000000a1', md5(g::text), md5(g::text || 'w'), '{"name":"x","size":8,"players":[]}'::jsonb
  from generate_series(1, 100) g;
select is((select count(*)::int from public.local_live_tournaments), 100, 'a user can own up to 100 live tournaments');
select throws_ok(
  $$insert into public.local_live_tournaments (owner_id, read_token_hash, write_token_hash, state)
    values ('00000000-0000-4000-8000-0000000000a1', 'r', 'w', '{}'::jsonb)$$,
  'P0001', 'quota_exceeded', 'the 101st live tournament of one user is refused');

select * from finish();
rollback;
