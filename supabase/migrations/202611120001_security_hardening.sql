-- Security hardening (Phase 3 audit, see docs/security.md).
-- Backward compatible: no function signature changes. It only removes access nobody should have.

set lock_timeout = '3s';
set statement_timeout = '30s';

-- 1. Supabase grants EXECUTE on new functions to anon and authenticated through default privileges.
--    Earlier migrations only ran "revoke ... from public", so the anon role could still call
--    functions that were meant for signed-in users (they stopped it only with an auth.uid() check).
--    Revoke anon explicitly. Spectator reads and invite joins stay open to anon on purpose:
--    get_shared_tournament, get_local_live_tournament, join_shared_tournament.
revoke execute on function public.add_shared_participant(uuid, text) from anon;
revoke execute on function public.add_shared_participant(uuid, text, text) from anon;
revoke execute on function public.add_shared_participant(uuid, text, text, text) from anon;
revoke execute on function public.cancel_shared_tournament(uuid) from anon;
revoke execute on function public.create_local_live_tournament(jsonb) from anon;
revoke execute on function public.create_shared_tournament(text, integer, text, jsonb) from anon;
revoke execute on function public.create_shared_tournament(text, integer, text, jsonb, text) from anon;
revoke execute on function public.get_dashboard_metrics() from anon;
revoke execute on function public.get_owned_shared_tournament(uuid) from anon;
revoke execute on function public.record_local_tournament_metrics(uuid, text, text, integer, integer, integer, integer, integer, timestamptz, timestamptz, boolean) from anon;
revoke execute on function public.remove_shared_participant(uuid, text) from anon;
revoke execute on function public.rotate_shared_invite(uuid) from anon;
revoke execute on function public.save_shared_tournament(uuid, jsonb) from anon;
revoke execute on function public.start_shared_tournament(uuid, jsonb) from anon;
revoke execute on function public.update_local_live_tournament(text, jsonb) from anon;

-- 2. Future functions are private until a migration grants them on purpose.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Tables are reachable only through the RPCs above. RLS is on and no grants exist, so access is
--    already denied; an explicit policy makes that intent visible and keeps the "every table has a
--    policy" invariant checkable.
create policy deny_direct_access on public.local_live_tournaments as restrictive for all to anon, authenticated using (false) with check (false);
create policy deny_direct_access on public.local_tournament_archives as restrictive for all to anon, authenticated using (false) with check (false);
create policy deny_direct_access on public.local_tournament_metrics as restrictive for all to anon, authenticated using (false) with check (false);
create policy deny_direct_access on public.setpoint_dashboard_admins as restrictive for all to anon, authenticated using (false) with check (false);
create policy deny_direct_access on public.shared_tournament_participants as restrictive for all to anon, authenticated using (false) with check (false);
create policy deny_direct_access on public.shared_tournaments as restrictive for all to anon, authenticated using (false) with check (false);

-- 4. Vendor isolation: new SQL calls app.current_user_id() instead of auth.uid(), so leaving
--    Supabase Auth later means changing this one function.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated;

create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$ select auth.uid() $$;

revoke all on function app.current_user_id() from public;
grant execute on function app.current_user_id() to anon, authenticated;

-- 5. Abuse limits. Anyone can get an anonymous session (rate limited per IP by Auth), and each row can hold
--    up to ~0.5 to 1 MB of state. Cap the rows one user can own so a single session cannot fill the database.
--    A trigger keeps this independent of the RPC bodies. The limits are far above honest use.
create or replace function app.enforce_owner_quota()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_count integer;
begin
  execute format('select count(*) from %I.%I where owner_id = $1', tg_table_schema, tg_table_name)
    into v_count using new.owner_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function app.enforce_owner_quota() from public, anon, authenticated;

create trigger shared_tournaments_owner_quota before insert on public.shared_tournaments
  for each row execute function app.enforce_owner_quota(100);
create trigger local_live_tournaments_owner_quota before insert on public.local_live_tournaments
  for each row execute function app.enforce_owner_quota(100);
create trigger local_tournament_archives_owner_quota before insert on public.local_tournament_archives
  for each row execute function app.enforce_owner_quota(200);
create trigger local_tournament_metrics_owner_quota before insert on public.local_tournament_metrics
  for each row execute function app.enforce_owner_quota(500);
