-- Grupos 20: torneios de 20 atletas (5 grupos de 4 ou 4 grupos de 5).
-- Só a lista de tamanhos aceitos muda; o corpo das funções é o da versão mais recente.
set lock_timeout = '3s';
set statement_timeout = '30s';

alter table public.shared_tournaments
  drop constraint if exists shared_tournaments_capacity_check;
alter table public.shared_tournaments
  add constraint shared_tournaments_capacity_check check (capacity in (8, 10, 12, 20, 24)) not valid;
alter table public.shared_tournaments
  validate constraint shared_tournaments_capacity_check;

alter table public.local_tournament_metrics
  drop constraint if exists local_tournament_metrics_tournament_size_check;
alter table public.local_tournament_metrics
  add constraint local_tournament_metrics_tournament_size_check check (tournament_size in (8, 10, 12, 20, 24)) not valid;
alter table public.local_tournament_metrics
  validate constraint local_tournament_metrics_tournament_size_check;

create or replace function public.create_shared_tournament(
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
  v_moderator jsonb;
  v_avatar text := p_initial_state->>'moderatorAvatarDataUrl';
begin
  if app.current_user_id() is null then raise exception 'moderator_auth_required'; end if;
  if p_capacity not in (8, 10, 12, 20, 24) then raise exception 'invalid_capacity'; end if;
  if p_moderator_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 60 then raise exception 'invalid_tournament_name'; end if;
  if nullif(trim(p_moderator_name), '') is null or char_length(trim(p_moderator_name)) > 40 then raise exception 'invalid_moderator_name'; end if;
  if (p_initial_state->>'size')::integer is distinct from p_capacity then raise exception 'capacity_mismatch'; end if;
  if v_avatar is not null and (length(v_avatar) > 12000 or v_avatar not like 'data:image/webp;base64,%') then
    raise exception 'invalid_avatar';
  end if;

  v_moderator := jsonb_build_object('id', v_player_id, 'name', trim(p_moderator_name), 'gender', p_moderator_gender);
  if v_avatar is not null then v_moderator := v_moderator || jsonb_build_object('photoDataUrl', v_avatar); end if;
  v_state := jsonb_set(coalesce(p_initial_state, '{}'::jsonb) - 'moderatorAvatarDataUrl', '{players}',
    jsonb_build_array(v_moderator), true);
  v_state := jsonb_set(v_state, '{rounds}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{groups}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{finals}', 'null'::jsonb, true);

  insert into public.shared_tournaments (id, owner_id, name, capacity, status, state, invite_token_hash, invite_expires_at)
  values (v_id, app.current_user_id(), trim(p_name), p_capacity, 'registration', v_state,
    encode(digest(v_invite_token, 'sha256'), 'hex'), v_invite_expires_at);
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, gender)
  values (v_id, v_player_id, trim(p_moderator_name), 'moderator', p_moderator_gender);

  return jsonb_build_object('id', v_id, 'status', 'registration', 'capacity', p_capacity,
    'state', v_state, 'inviteToken', v_invite_token, 'inviteExpiresAt', v_invite_expires_at, 'expiresAt', null);
end;
$$;

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
  if app.current_user_id() is null then raise exception 'moderator_auth_required'; end if;
  if p_tournament_id is null or p_started_at is null then raise exception 'invalid_tournament_metrics'; end if;
  if p_tournament_mode not in ('super', 'groups')
     or p_doubles_format not in ('open', 'mixed')
     or p_tournament_size not in (8, 10, 12, 20, 24)
     or p_court_count not between 1 and 6
     or p_games_to_win not between 3 and 6
     or p_round_count not between 1 and 46
     or p_participant_count not between 0 and 24 then
    raise exception 'invalid_tournament_metrics';
  end if;

  select owner_id into v_owner_id from public.local_tournament_metrics
  where tournament_id = p_tournament_id;
  if found and v_owner_id <> app.current_user_id() then raise exception 'analytics_owner_mismatch'; end if;

  v_status := case when p_finished_at is not null then 'completed'
    when p_abandoned then 'abandoned' else 'started' end;
  v_duration_seconds := case when p_finished_at is not null
    then greatest(0, extract(epoch from (p_finished_at - p_started_at))::integer) else null end;

  insert into public.local_tournament_metrics (
    tournament_id, owner_id, tournament_mode, doubles_format, tournament_size,
    court_count, games_to_win, round_count, participant_count, status,
    started_at, finished_at, duration_seconds, updated_at
  ) values (
    p_tournament_id, app.current_user_id(), p_tournament_mode, p_doubles_format, p_tournament_size,
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
  where public.local_tournament_metrics.owner_id = app.current_user_id();
end;
$$;
