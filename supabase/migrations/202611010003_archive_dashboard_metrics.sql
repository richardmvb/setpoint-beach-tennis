alter table public.shared_tournaments
  drop constraint if exists shared_tournaments_status_check;
alter table public.shared_tournaments
  add constraint shared_tournaments_status_check
  check (status in ('registration', 'ready', 'active', 'completed', 'archived'));
alter table public.shared_tournaments
  add column if not exists archived_at timestamptz;

create or replace function public.cancel_shared_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  update public.shared_tournaments set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    invite_token_hash = encode(digest(gen_random_bytes(32), 'sha256'), 'hex'),
    invite_expires_at = now(),
    updated_at = now()
  where id = p_tournament_id and owner_id = auth.uid() and status <> 'archived';
  if not found then raise exception 'moderator_only'; end if;
end;
$$;

create or replace function public.cleanup_expired_shared_tournaments()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_archived integer;
begin
  update public.shared_tournaments set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    invite_token_hash = encode(digest(gen_random_bytes(32), 'sha256'), 'hex'),
    invite_expires_at = now(),
    updated_at = now()
  where status <> 'archived'
    and ((status = 'registration' and invite_expires_at <= now())
      or (expires_at is not null and expires_at <= now()));
  get diagnostics v_archived = row_count;
  return v_archived;
end;
$$;

create table if not exists public.setpoint_dashboard_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.setpoint_dashboard_admins enable row level security;
revoke all on public.setpoint_dashboard_admins from public, anon, authenticated;

create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_metrics jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then
    raise exception 'dashboard_admin_required';
  end if;

  select jsonb_build_object(
    'tournaments_total', count(*),
    'tournaments_started', count(*) filter (where started_at is not null),
    'tournaments_completed', count(*) filter (where state->>'finishedAt' is not null),
    'tournaments_active', count(*) filter (where status = 'active'),
    'tournaments_archived', count(*) filter (where status = 'archived'),
    'moderators_total', count(distinct owner_id),
    'moderators_returned', (
      select count(*) from (
        select owner_id from public.shared_tournaments group by owner_id having count(*) > 1
      ) returning_owners
    ),
    'participants_total', (
      select count(*) from public.shared_tournament_participants where role in ('guest', 'manual')
    ),
    'participants_invited', (
      select count(*) from public.shared_tournament_participants where role = 'guest'
    ),
    'participants_manual', (
      select count(*) from public.shared_tournament_participants where role = 'manual'
    ),
    'completion_rate', round(
      100.0 * count(*) filter (where state->>'finishedAt' is not null) / nullif(count(*), 0), 1
    ),
    'average_duration_seconds', (
      select round(avg(extract(epoch from (
        (state->>'finishedAt')::timestamptz - (state->>'startedAt')::timestamptz
      ))))::integer
      from public.shared_tournaments
      where state->>'startedAt' is not null and state->>'finishedAt' is not null
    )
  ) into v_metrics
  from public.shared_tournaments;

  return v_metrics;
end;
$$;

revoke all on function public.cancel_shared_tournament(uuid) from public;
revoke all on function public.cleanup_expired_shared_tournaments() from public, anon, authenticated;
revoke all on function public.get_dashboard_metrics() from public;
grant execute on function public.cancel_shared_tournament(uuid) to authenticated;
grant execute on function public.get_dashboard_metrics() to authenticated;
