-- Super 24 misto em três quadras gera 46 rodadas.
-- Mantém as demais validações de métricas locais inalteradas.
alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_round_count_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_round_count_check check (round_count between 1 and 46);

create or replace function public.record_local_tournament_metrics(
  p_tournament_id uuid,
  p_tournament_mode text,
  p_doubles_format text,
  p_tournament_size integer,
  p_court_count integer,
  p_games_to_win integer,
  p_round_count integer,
  p_participant_count integer,
  p_started_at timestamptz,
  p_finished_at timestamptz default null,
  p_abandoned boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_status text;
  v_duration_seconds integer;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if p_tournament_id is null or p_started_at is null then raise exception 'invalid_tournament_metrics'; end if;
  if p_tournament_mode not in ('super', 'groups')
     or p_doubles_format not in ('open', 'mixed')
     or p_tournament_size not in (8, 10, 12, 24)
     or p_court_count not between 1 and 6
     or p_games_to_win not between 3 and 6
     or p_round_count not between 1 and 46
     or p_participant_count not between 0 and 24 then
    raise exception 'invalid_tournament_metrics';
  end if;

  select owner_id into v_owner_id from public.local_tournament_metrics
  where tournament_id = p_tournament_id;
  if found and v_owner_id <> auth.uid() then raise exception 'analytics_owner_mismatch'; end if;

  v_status := case when p_finished_at is not null then 'completed'
    when p_abandoned then 'abandoned' else 'started' end;
  v_duration_seconds := case when p_finished_at is not null
    then greatest(0, extract(epoch from (p_finished_at - p_started_at))::integer) else null end;

  insert into public.local_tournament_metrics (
    tournament_id, owner_id, tournament_mode, doubles_format, tournament_size,
    court_count, games_to_win, round_count, participant_count, status,
    started_at, finished_at, duration_seconds, updated_at
  ) values (
    p_tournament_id, auth.uid(), p_tournament_mode, p_doubles_format, p_tournament_size,
    p_court_count, p_games_to_win, p_round_count, p_participant_count, v_status,
    p_started_at, p_finished_at, v_duration_seconds, now()
  ) on conflict (tournament_id) do update set
    tournament_mode = excluded.tournament_mode,
    doubles_format = excluded.doubles_format,
    tournament_size = excluded.tournament_size,
    court_count = excluded.court_count,
    games_to_win = excluded.games_to_win,
    round_count = excluded.round_count,
    participant_count = excluded.participant_count,
    status = excluded.status,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    duration_seconds = excluded.duration_seconds,
    updated_at = now()
  where public.local_tournament_metrics.owner_id = auth.uid();
end;
$$;

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
  ) then raise exception 'dashboard_admin_required'; end if;

  with tournament_rollup as (
    select owner_id, status, started_at,
      case when state->>'finishedAt' is not null then (state->>'finishedAt')::timestamptz else null end as finished_at,
      case when state->>'startedAt' is not null and state->>'finishedAt' is not null
        then greatest(0, extract(epoch from ((state->>'finishedAt')::timestamptz - (state->>'startedAt')::timestamptz))::integer)
        else null end as duration_seconds,
      coalesce(state->>'tournamentMode', 'super') as tournament_mode,
      capacity as tournament_size,
      coalesce(state->>'doublesFormat', 'open') as doubles_format
    from public.shared_tournaments
    union all
    select owner_id, status, started_at, finished_at, duration_seconds, tournament_mode, tournament_size, doubles_format
    from public.local_tournament_metrics
  )
  select jsonb_build_object(
    'tournaments_total', count(*),
    'tournaments_started', count(*) filter (where started_at is not null),
    'tournaments_completed', count(*) filter (where finished_at is not null),
    'tournaments_active', count(*) filter (where status in ('active', 'started')),
    'tournaments_archived', count(*) filter (where status = 'archived'),
    'tournaments_abandoned', count(*) filter (where status = 'abandoned'),
    'tournaments_size_24', count(*) filter (where tournament_size = 24),
    'super_tournaments', count(*) filter (where tournament_mode = 'super'),
    'group_tournaments', count(*) filter (where tournament_mode = 'groups'),
    'mixed_tournaments', count(*) filter (where doubles_format = 'mixed'),
    'open_tournaments', count(*) filter (where doubles_format = 'open'),
    'moderators_total', count(distinct owner_id),
    'moderators_returned', (
      select count(*) from (select owner_id from tournament_rollup group by owner_id having count(*) > 1) returning_owners
    ),
    'participants_total',
      coalesce((select sum(participant_count) from public.local_tournament_metrics), 0)
      + (select count(*) from public.shared_tournament_participants where role in ('guest', 'manual')),
    'participants_invited', (select count(*) from public.shared_tournament_participants where role = 'guest'),
    'participants_manual', (select count(*) from public.shared_tournament_participants where role = 'manual'),
    'completion_rate', round(100.0 * count(*) filter (where finished_at is not null)
      / nullif(count(*) filter (where started_at is not null), 0), 1),
    'average_duration_seconds', round(avg(duration_seconds) filter (where finished_at is not null))::integer
  ) into v_metrics from tournament_rollup;
  return v_metrics;
end;
$$;


revoke all on function public.record_local_tournament_metrics(uuid, text, text, integer, integer, integer, integer, integer, timestamptz, timestamptz, boolean) from public;
grant execute on function public.record_local_tournament_metrics(uuid, text, text, integer, integer, integer, integer, integer, timestamptz, timestamptz, boolean) to authenticated;
