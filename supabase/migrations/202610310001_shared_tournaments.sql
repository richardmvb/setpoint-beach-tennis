create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.shared_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  capacity integer not null check (capacity in (8, 10, 12)),
  status text not null default 'registration'
    check (status in ('registration', 'ready', 'active', 'completed')),
  state jsonb not null,
  invite_token_hash text not null unique,
  invite_expires_at timestamptz not null,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_tournament_participants (
  tournament_id uuid not null references public.shared_tournaments(id) on delete cascade,
  player_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null check (role in ('moderator', 'guest')),
  join_id uuid,
  created_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create unique index if not exists shared_tournament_guest_join_id_idx
  on public.shared_tournament_participants(tournament_id, join_id)
  where join_id is not null;

alter table public.shared_tournaments enable row level security;
alter table public.shared_tournament_participants enable row level security;
revoke all on public.shared_tournaments from public, anon, authenticated;
revoke all on public.shared_tournament_participants from public, anon, authenticated;

create or replace function public.create_shared_tournament(
  p_name text,
  p_capacity integer,
  p_moderator_name text,
  p_initial_state jsonb
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
  if p_capacity not in (8, 10, 12) then raise exception 'invalid_capacity'; end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 60 then raise exception 'invalid_tournament_name'; end if;
  if nullif(trim(p_moderator_name), '') is null or char_length(trim(p_moderator_name)) > 40 then raise exception 'invalid_moderator_name'; end if;
  if (p_initial_state->>'size')::integer is distinct from p_capacity then raise exception 'capacity_mismatch'; end if;

  v_state := jsonb_set(coalesce(p_initial_state, '{}'::jsonb), '{players}',
    jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_moderator_name))), true);
  v_state := jsonb_set(v_state, '{rounds}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{groups}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{finals}', 'null'::jsonb, true);

  insert into public.shared_tournaments (
    id, owner_id, name, capacity, status, state, invite_token_hash, invite_expires_at
  ) values (
    v_id, auth.uid(), trim(p_name), p_capacity, 'registration', v_state,
    encode(digest(v_invite_token, 'sha256'), 'hex'), v_invite_expires_at
  );

  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role)
  values (v_id, v_player_id, trim(p_moderator_name), 'moderator');

  return jsonb_build_object(
    'id', v_id, 'status', 'registration', 'capacity', p_capacity, 'state', v_state,
    'inviteToken', v_invite_token, 'inviteExpiresAt', v_invite_expires_at, 'expiresAt', null
  );
end;
$$;

create or replace function public.join_shared_tournament(p_invite_token text, p_display_name text, p_join_id uuid)
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
  if p_join_id is null then raise exception 'join_id_required'; end if;

  select * into v_tournament from public.shared_tournaments
  where invite_token_hash = encode(digest(p_invite_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'invalid_invite'; end if;

  select player_id into v_player_id from public.shared_tournament_participants
  where tournament_id = v_tournament.id and join_id = p_join_id;
  if found then
    return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
      'capacity', v_tournament.capacity, 'state', v_tournament.state,
      'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
  end if;

  if v_tournament.status <> 'registration' or now() >= v_tournament.invite_expires_at then
    raise exception 'registration_closed';
  end if;
  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  if v_count >= v_tournament.capacity then raise exception 'tournament_full'; end if;

  v_player_id := gen_random_uuid()::text;
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, join_id)
  values (v_tournament.id, v_player_id, trim(p_display_name), 'guest', p_join_id);

  v_state := jsonb_set(v_tournament.state, '{players}',
    coalesce(v_tournament.state->'players', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_display_name))), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now()
  where id = v_tournament.id;

  return jsonb_build_object('id', v_tournament.id, 'status', v_status,
    'capacity', v_tournament.capacity, 'state', v_state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', null);
end;
$$;

create or replace function public.rotate_shared_invite(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_invite_token text := encode(gen_random_bytes(32), 'hex');
  v_invite_expires_at timestamptz := now() + interval '15 minutes';
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  select * into v_tournament from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.expires_at is not null and now() >= v_tournament.expires_at then raise exception 'tournament_expired'; end if;

  update public.shared_tournaments set
    invite_token_hash = encode(digest(v_invite_token, 'sha256'), 'hex'),
    invite_expires_at = v_invite_expires_at,
    updated_at = now()
  where id = p_tournament_id;

  return jsonb_build_object('inviteToken', v_invite_token, 'inviteExpiresAt', v_invite_expires_at);
end;
$$;

create or replace function public.get_shared_tournament(p_invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_count integer;
begin
  if length(coalesce(p_invite_token, '')) <> 64 then raise exception 'invalid_invite'; end if;
  select * into v_tournament from public.shared_tournaments
  where invite_token_hash = encode(digest(p_invite_token, 'sha256'), 'hex');
  if not found then raise exception 'invalid_invite'; end if;
  if v_tournament.status = 'registration' and now() >= v_tournament.invite_expires_at then raise exception 'invite_expired'; end if;
  if v_tournament.expires_at is not null and now() >= v_tournament.expires_at then raise exception 'tournament_expired'; end if;

  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at,
    'canJoin', v_tournament.status = 'registration' and v_count < v_tournament.capacity);
end;
$$;

create or replace function public.get_owned_shared_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  select * into v_tournament from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid();
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.expires_at is not null and now() >= v_tournament.expires_at then raise exception 'tournament_expired'; end if;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at,
    'canJoin', v_tournament.status = 'registration');
end;
$$;

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

  update public.shared_tournaments set status = 'active', state = p_state,
    started_at = now(), expires_at = v_expires_at, updated_at = now()
  where id = p_tournament_id returning * into v_tournament;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
end;
$$;

create or replace function public.save_shared_tournament(p_tournament_id uuid, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  update public.shared_tournaments set state = p_state,
    status = case when coalesce((p_state->'finals'->>'complete')::boolean, false) then 'completed' else status end,
    updated_at = now()
  where id = p_tournament_id and owner_id = auth.uid() and status = 'active' and now() < expires_at
  returning * into v_tournament;
  if not found then raise exception 'moderator_only_or_tournament_expired'; end if;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
end;
$$;

create or replace function public.cleanup_expired_shared_tournaments()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.shared_tournaments
  where (status = 'registration' and invite_expires_at <= now())
     or (expires_at is not null and expires_at <= now());
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.create_shared_tournament(text, integer, text, jsonb) from public;
revoke all on function public.join_shared_tournament(text, text, uuid) from public;
revoke all on function public.rotate_shared_invite(uuid) from public;
revoke all on function public.get_shared_tournament(text) from public;
revoke all on function public.get_owned_shared_tournament(uuid) from public;
revoke all on function public.start_shared_tournament(uuid, jsonb) from public;
revoke all on function public.save_shared_tournament(uuid, jsonb) from public;
revoke all on function public.cleanup_expired_shared_tournaments() from public, anon, authenticated;
grant execute on function public.create_shared_tournament(text, integer, text, jsonb) to authenticated;
grant execute on function public.join_shared_tournament(text, text, uuid) to anon, authenticated;
grant execute on function public.rotate_shared_invite(uuid) to authenticated;
grant execute on function public.get_shared_tournament(text) to anon, authenticated;
grant execute on function public.get_owned_shared_tournament(uuid) to authenticated;
grant execute on function public.start_shared_tournament(uuid, jsonb) to authenticated;
grant execute on function public.save_shared_tournament(uuid, jsonb) to authenticated;

select cron.schedule(
  'cleanup-setpoint-shared-tournaments',
  '*/5 * * * *',
  'select public.cleanup_expired_shared_tournaments();'
);