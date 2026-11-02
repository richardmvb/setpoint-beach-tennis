alter table public.shared_tournaments
  drop constraint if exists shared_tournaments_capacity_check;
alter table public.shared_tournaments
  add constraint shared_tournaments_capacity_check check (capacity in (8, 10, 12, 24));

alter table public.shared_tournament_participants
  add column if not exists gender text not null default 'male';
alter table public.shared_tournament_participants
  drop constraint if exists shared_tournament_participants_gender_check;
alter table public.shared_tournament_participants
  add constraint shared_tournament_participants_gender_check check (gender in ('male', 'female'));

alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_tournament_size_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_tournament_size_check check (tournament_size in (8, 10, 12, 24));
alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_court_count_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_court_count_check check (court_count between 1 and 6);
alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_round_count_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_round_count_check check (round_count between 1 and 23);
alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_participant_count_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_participant_count_check check (participant_count between 0 and 24);
alter table public.local_tournament_metrics
  add column if not exists doubles_format text not null default 'open';
alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_doubles_format_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_doubles_format_check check (doubles_format in ('open', 'mixed'));

drop function if exists public.record_local_tournament_metrics(uuid, text, integer, integer, integer, integer, integer, timestamptz, timestamptz, boolean);
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
     or p_round_count not between 1 and 23
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
revoke all on function public.get_dashboard_metrics() from public;
grant execute on function public.record_local_tournament_metrics(uuid, text, text, integer, integer, integer, integer, integer, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.get_dashboard_metrics() to authenticated;

drop function if exists public.create_shared_tournament(text, integer, text, jsonb);
create function public.create_shared_tournament(
  p_name text,
  p_capacity integer,
  p_moderator_name text,
  p_initial_state jsonb,
  p_moderator_gender text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_player_id text := gen_random_uuid()::text;
  v_invite_token text := encode(gen_random_bytes(32), 'hex');
  v_invite_expires_at timestamptz := now() + interval '15 minutes';
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if p_capacity not in (8, 10, 12, 24) then raise exception 'invalid_capacity'; end if;
  if p_moderator_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 60 then raise exception 'invalid_tournament_name'; end if;
  if nullif(trim(p_moderator_name), '') is null or char_length(trim(p_moderator_name)) > 40 then raise exception 'invalid_moderator_name'; end if;
  if (p_initial_state->>'size')::integer is distinct from p_capacity then raise exception 'capacity_mismatch'; end if;

  v_state := jsonb_set(coalesce(p_initial_state, '{}'::jsonb), '{players}',
    jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_moderator_name), 'gender', p_moderator_gender)), true);
  v_state := jsonb_set(v_state, '{rounds}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{groups}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{finals}', 'null'::jsonb, true);

  insert into public.shared_tournaments (id, owner_id, name, capacity, status, state, invite_token_hash, invite_expires_at)
  values (v_id, auth.uid(), trim(p_name), p_capacity, 'registration', v_state,
    encode(digest(v_invite_token, 'sha256'), 'hex'), v_invite_expires_at);
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, gender)
  values (v_id, v_player_id, trim(p_moderator_name), 'moderator', p_moderator_gender);

  return jsonb_build_object('id', v_id, 'status', 'registration', 'capacity', p_capacity,
    'state', v_state, 'inviteToken', v_invite_token, 'inviteExpiresAt', v_invite_expires_at, 'expiresAt', null);
end;
$$;

create function public.create_shared_tournament(p_name text, p_capacity integer, p_moderator_name text, p_initial_state jsonb)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.create_shared_tournament(p_name, p_capacity, p_moderator_name, p_initial_state, 'male'); $$;

drop function if exists public.join_shared_tournament(text, text, uuid);
create function public.join_shared_tournament(p_invite_token text, p_display_name text, p_gender text, p_join_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_player_id text;
  v_count integer;
  v_state jsonb;
  v_status text;
begin
  if length(coalesce(p_invite_token, '')) <> 64 then raise exception 'invalid_invite'; end if;
  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 40 then raise exception 'invalid_display_name'; end if;
  if p_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if p_join_id is null then raise exception 'join_id_required'; end if;
  select * into v_tournament from public.shared_tournaments
    where invite_token_hash = encode(digest(p_invite_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'invalid_invite'; end if;
  select player_id into v_player_id from public.shared_tournament_participants
    where tournament_id = v_tournament.id and join_id = p_join_id;
  if found then
    return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status, 'capacity', v_tournament.capacity,
      'state', v_tournament.state, 'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
  end if;
  if v_tournament.status <> 'registration' or now() >= v_tournament.invite_expires_at then raise exception 'registration_closed'; end if;
  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  if v_count >= v_tournament.capacity then raise exception 'tournament_full'; end if;

  v_player_id := gen_random_uuid()::text;
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, join_id, gender)
    values (v_tournament.id, v_player_id, trim(p_display_name), 'guest', p_join_id, p_gender);
  v_state := jsonb_set(v_tournament.state, '{players}',
    coalesce(v_tournament.state->'players', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_display_name), 'gender', p_gender)), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now() where id = v_tournament.id;
  return jsonb_build_object('id', v_tournament.id, 'status', v_status, 'capacity', v_tournament.capacity,
    'state', v_state, 'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', null);
end;
$$;

create function public.join_shared_tournament(p_invite_token text, p_display_name text, p_join_id uuid)
returns jsonb language sql security definer set search_path = public, extensions, pg_temp
as $$ select public.join_shared_tournament(p_invite_token, p_display_name, 'male', p_join_id); $$;

drop function if exists public.add_shared_participant(uuid, text);
create function public.add_shared_participant(p_tournament_id uuid, p_display_name text, p_gender text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_player_id text := gen_random_uuid()::text;
  v_count integer;
  v_status text;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if p_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 40 then raise exception 'invalid_display_name'; end if;
  select * into v_tournament from public.shared_tournaments where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.status not in ('registration', 'ready') then raise exception 'registration_closed'; end if;
  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  if v_count >= v_tournament.capacity then raise exception 'tournament_full'; end if;
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, gender)
    values (v_tournament.id, v_player_id, trim(p_display_name), 'manual', p_gender);
  v_state := jsonb_set(v_tournament.state, '{players}', coalesce(v_tournament.state->'players', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_display_name), 'manual', true, 'gender', p_gender)), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now() where id = v_tournament.id;
  return jsonb_build_object('id', v_tournament.id, 'status', v_status, 'capacity', v_tournament.capacity,
    'state', v_state, 'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at,
    'canJoin', v_status = 'registration');
end;
$$;

create function public.add_shared_participant(p_tournament_id uuid, p_display_name text)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.add_shared_participant(p_tournament_id, p_display_name, 'male'); $$;

create or replace function public.start_shared_tournament(p_tournament_id uuid, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_count integer;
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  select * into v_tournament from public.shared_tournaments where id = p_tournament_id for update;
  if not found or v_tournament.owner_id <> auth.uid() then raise exception 'moderator_only'; end if;
  if v_tournament.status <> 'ready' then raise exception 'tournament_not_ready'; end if;
  select count(*) into v_count from public.shared_tournament_participants where tournament_id = p_tournament_id;
  if v_count <> v_tournament.capacity then raise exception 'participant_capacity_not_met'; end if;
  if jsonb_array_length(coalesce(p_state->'players', '[]'::jsonb)) <> v_tournament.capacity then raise exception 'invalid_player_state'; end if;
  if p_state->>'doublesFormat' = 'mixed' and (
    (select count(*) from jsonb_array_elements(p_state->'players') player where player->>'gender' = 'male') <> v_tournament.capacity / 2
    or (select count(*) from jsonb_array_elements(p_state->'players') player where player->>'gender' = 'female') <> v_tournament.capacity / 2
  ) then raise exception 'mixed_gender_balance_required'; end if;

  update public.shared_tournaments set status = 'active', state = p_state,
    started_at = now(), expires_at = v_expires_at, updated_at = now()
  where id = p_tournament_id returning * into v_tournament;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
end;
$$;

revoke all on function public.create_shared_tournament(text, integer, text, jsonb) from public;
revoke all on function public.join_shared_tournament(text, text, uuid) from public;
revoke all on function public.add_shared_participant(uuid, text) from public;
revoke all on function public.create_shared_tournament(text, integer, text, jsonb, text) from public;
revoke all on function public.join_shared_tournament(text, text, text, uuid) from public;
revoke all on function public.add_shared_participant(uuid, text, text) from public;
revoke all on function public.start_shared_tournament(uuid, jsonb) from public;
grant execute on function public.create_shared_tournament(text, integer, text, jsonb, text) to authenticated;
grant execute on function public.create_shared_tournament(text, integer, text, jsonb) to authenticated;
grant execute on function public.join_shared_tournament(text, text, text, uuid) to anon, authenticated;
grant execute on function public.join_shared_tournament(text, text, uuid) to anon, authenticated;
grant execute on function public.add_shared_participant(uuid, text, text) to authenticated;
grant execute on function public.add_shared_participant(uuid, text) to authenticated;
grant execute on function public.start_shared_tournament(uuid, jsonb) to authenticated;
