alter table public.local_live_tournaments
  drop constraint if exists local_live_tournaments_status_check;
alter table public.local_live_tournaments
  add constraint local_live_tournaments_status_check check (status in ('active', 'completed', 'archived'));
alter table public.local_live_tournaments
  add column if not exists archived_at timestamptz;

create or replace function public.refresh_shared_tournament_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active' and new.status in ('active', 'completed')
    and new.updated_at is distinct from old.updated_at then
    new.expires_at := greatest(coalesce(new.expires_at, new.updated_at), new.updated_at + interval '24 hours');
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_shared_tournament_expiry on public.shared_tournaments;
create trigger refresh_shared_tournament_expiry before update on public.shared_tournaments
for each row execute function public.refresh_shared_tournament_expiry();

update public.shared_tournaments
set expires_at = updated_at + interval '24 hours'
where status in ('active', 'completed') and updated_at > now() - interval '24 hours'
  and (expires_at is null or expires_at < updated_at + interval '24 hours');

create or replace function public.prevent_archived_local_live_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'tournament_archived';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_archived_local_live_updates on public.local_live_tournaments;
create trigger prevent_archived_local_live_updates before update on public.local_live_tournaments
for each row execute function public.prevent_archived_local_live_updates();

create or replace function public.cleanup_expired_shared_tournaments()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_shared integer;
  v_local integer;
begin
  update public.shared_tournaments set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    invite_token_hash = encode(digest(gen_random_bytes(32), 'sha256'), 'hex'),
    invite_expires_at = now()
  where (status = 'registration' and invite_expires_at <= now())
    or (status in ('ready', 'active', 'completed') and updated_at <= now() - interval '24 hours');
  get diagnostics v_shared = row_count;

  update public.local_live_tournaments set
    status = 'archived',
    archived_at = coalesce(archived_at, now())
  where status in ('active', 'completed') and updated_at <= now() - interval '24 hours';
  get diagnostics v_local = row_count;

  return v_shared + v_local;
end;
$$;

revoke all on function public.refresh_shared_tournament_expiry() from public, anon, authenticated;
revoke all on function public.prevent_archived_local_live_updates() from public, anon, authenticated;
revoke all on function public.cleanup_expired_shared_tournaments() from public, anon, authenticated;

create or replace function public.get_dashboard_archived_local_tournaments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then raise exception 'dashboard_admin_required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', tournament.id,
      'source', 'local',
      'name', coalesce(nullif(tournament.state->>'name', ''), 'Torneio'),
      'size', tournament.state->'size',
      'mode', coalesce(tournament.state->>'tournamentMode', 'super'),
      'updated_at', tournament.updated_at,
      'matches_total', (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(tournament.state->'rounds') = 'array' then tournament.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item
      ),
      'matches_completed', (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(tournament.state->'rounds') = 'array' then tournament.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item where match_item->>'scoreA' is not null and match_item->>'scoreB' is not null
      )
    ) order by tournament.updated_at desc)
    from public.local_live_tournaments tournament where tournament.status = 'archived'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_dashboard_tournament(p_source text, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb;
  v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then raise exception 'dashboard_admin_required'; end if;

  if p_source = 'shared' then
    select state, status into v_state, v_status from public.shared_tournaments
    where id = p_tournament_id and status in ('active', 'completed', 'archived');
  elsif p_source = 'local' then
    select state, status into v_state, v_status from public.local_live_tournaments
    where id = p_tournament_id and status in ('active', 'completed', 'archived');
  else
    raise exception 'invalid_tournament_source';
  end if;
  if not found then raise exception 'tournament_not_available'; end if;
  return jsonb_build_object('id', p_tournament_id, 'status', v_status, 'state', v_state);
end;
$$;

revoke all on function public.get_dashboard_archived_local_tournaments() from public, anon, authenticated;
revoke all on function public.get_dashboard_tournament(text, uuid) from public, anon, authenticated;
grant execute on function public.get_dashboard_archived_local_tournaments() to authenticated;
grant execute on function public.get_dashboard_tournament(text, uuid) to authenticated;

select cron.schedule(
  'cleanup-setpoint-shared-tournaments',
  '*/5 * * * *',
  'select public.cleanup_expired_shared_tournaments();'
);