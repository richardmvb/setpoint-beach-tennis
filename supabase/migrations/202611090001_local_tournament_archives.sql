-- Full-detail copy of every tournament started in "local" mode, so that administrators can
-- retrieve and revisit it from the dashboard. Photos are never uploaded; analyticsId is kept
-- as the primary key so repeated saves from the same device update the same row.

create table if not exists public.local_tournament_archives (
  tournament_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  live_tournament_id uuid,
  name text not null,
  tournament_mode text not null default 'super',
  status text not null check (status in ('active', 'completed')),
  state jsonb not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_tournament_archives_updated_idx
  on public.local_tournament_archives (updated_at desc);

alter table public.local_tournament_archives enable row level security;
revoke all on public.local_tournament_archives from public, anon, authenticated;

create or replace function public.save_local_tournament_archive(
  p_tournament_id uuid,
  p_state jsonb,
  p_live_tournament_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_state jsonb;
  v_finished_at timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if p_tournament_id is null then raise exception 'invalid_tournament_state'; end if;
  if jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 900000 then
    raise exception 'invalid_tournament_state';
  end if;
  if nullif(trim(p_state->>'name'), '') is null
     or jsonb_typeof(p_state->'players') <> 'array'
     or jsonb_typeof(p_state->'rounds') <> 'array'
     or jsonb_array_length(p_state->'rounds') = 0 then
    raise exception 'invalid_tournament_state';
  end if;

  select owner_id into v_owner_id from public.local_tournament_archives
  where tournament_id = p_tournament_id;
  if found and v_owner_id <> auth.uid() then raise exception 'archive_owner_mismatch'; end if;

  -- Defence in depth: the client already strips photos and the analytics id.
  v_state := (p_state - 'analyticsId') || jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(player - 'photoDataUrl') from jsonb_array_elements(p_state->'players') as player
    ), '[]'::jsonb)
  );
  v_finished_at := nullif(v_state->>'finishedAt', '')::timestamptz;

  insert into public.local_tournament_archives (
    tournament_id, owner_id, live_tournament_id, name, tournament_mode, status,
    state, started_at, finished_at, updated_at
  ) values (
    p_tournament_id, auth.uid(), p_live_tournament_id,
    left(trim(v_state->>'name'), 60), coalesce(v_state->>'tournamentMode', 'super'),
    case when v_finished_at is null then 'active' else 'completed' end,
    v_state, nullif(v_state->>'startedAt', '')::timestamptz, v_finished_at, now()
  ) on conflict (tournament_id) do update set
    live_tournament_id = coalesce(excluded.live_tournament_id, public.local_tournament_archives.live_tournament_id),
    name = excluded.name,
    tournament_mode = excluded.tournament_mode,
    status = excluded.status,
    state = excluded.state,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    updated_at = now()
  where public.local_tournament_archives.owner_id = auth.uid();
end;
$$;

create or replace function public.get_dashboard_local_archives()
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
      'id', archive.tournament_id,
      'live_id', archive.live_tournament_id,
      'source', 'local',
      'name', archive.name,
      'size', archive.state->'size',
      'mode', archive.tournament_mode,
      'status', archive.status,
      'updated_at', archive.updated_at,
      'matches_total', (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(archive.state->'rounds') = 'array' then archive.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item
      ),
      'matches_completed', (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(archive.state->'rounds') = 'array' then archive.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item where match_item->>'scoreA' is not null and match_item->>'scoreB' is not null
      )
    ) order by archive.updated_at desc)
    from public.local_tournament_archives archive
  ), '[]'::jsonb);
end;
$$;

-- Same contract as before; a local id that is not a live link now falls back to the full archive.
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
    select state, status into v_state, v_status from public.local_tournament_archives
    where tournament_id = p_tournament_id;
    if not found then
      select state, status into v_state, v_status from public.local_live_tournaments
      where id = p_tournament_id and status in ('active', 'completed', 'archived');
    end if;
  else
    raise exception 'invalid_tournament_source';
  end if;
  if not found then raise exception 'tournament_not_available'; end if;
  return jsonb_build_object('id', p_tournament_id, 'status', v_status, 'state', v_state);
end;
$$;

revoke all on function public.save_local_tournament_archive(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.get_dashboard_local_archives() from public, anon, authenticated;
revoke all on function public.get_dashboard_tournament(text, uuid) from public, anon, authenticated;
grant execute on function public.save_local_tournament_archive(uuid, jsonb, uuid) to authenticated;
grant execute on function public.get_dashboard_local_archives() to authenticated;
grant execute on function public.get_dashboard_tournament(text, uuid) to authenticated;
