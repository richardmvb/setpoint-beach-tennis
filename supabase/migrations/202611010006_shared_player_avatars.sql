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
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if p_capacity not in (8, 10, 12, 24) then raise exception 'invalid_capacity'; end if;
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
  values (v_id, auth.uid(), trim(p_name), p_capacity, 'registration', v_state,
    encode(digest(v_invite_token, 'sha256'), 'hex'), v_invite_expires_at);
  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, gender)
  values (v_id, v_player_id, trim(p_moderator_name), 'moderator', p_moderator_gender);

  return jsonb_build_object('id', v_id, 'status', 'registration', 'capacity', p_capacity,
    'state', v_state, 'inviteToken', v_invite_token, 'inviteExpiresAt', v_invite_expires_at, 'expiresAt', null);
end;
$$;

drop function if exists public.join_shared_tournament(text, text, text, uuid);
drop function if exists public.join_shared_tournament(text, text, uuid);
create function public.join_shared_tournament(
  p_invite_token text, p_display_name text, p_gender text, p_join_id uuid, p_avatar_data text
)
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
  v_player jsonb;
begin
  if length(coalesce(p_invite_token, '')) <> 64 then raise exception 'invalid_invite'; end if;
  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 40 then raise exception 'invalid_display_name'; end if;
  if p_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if p_avatar_data is not null and (length(p_avatar_data) > 12000 or p_avatar_data not like 'data:image/webp;base64,%') then raise exception 'invalid_avatar'; end if;
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
  v_player := jsonb_build_object('id', v_player_id, 'name', trim(p_display_name), 'gender', p_gender);
  if p_avatar_data is not null then v_player := v_player || jsonb_build_object('photoDataUrl', p_avatar_data); end if;
  v_state := jsonb_set(v_tournament.state, '{players}',
    coalesce(v_tournament.state->'players', '[]'::jsonb) || jsonb_build_array(v_player), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now() where id = v_tournament.id;
  return jsonb_build_object('id', v_tournament.id, 'status', v_status, 'capacity', v_tournament.capacity,
    'state', v_state, 'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', null);
end;
$$;

create function public.join_shared_tournament(p_invite_token text, p_display_name text, p_gender text, p_join_id uuid)
returns jsonb language sql security definer set search_path = public, extensions, pg_temp
as $$ select public.join_shared_tournament(p_invite_token, p_display_name, p_gender, p_join_id, null); $$;
create function public.join_shared_tournament(p_invite_token text, p_display_name text, p_join_id uuid)
returns jsonb language sql security definer set search_path = public, extensions, pg_temp
as $$ select public.join_shared_tournament(p_invite_token, p_display_name, 'male', p_join_id, null); $$;

drop function if exists public.add_shared_participant(uuid, text, text);
drop function if exists public.add_shared_participant(uuid, text);
create function public.add_shared_participant(p_tournament_id uuid, p_display_name text, p_gender text, p_avatar_data text)
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
  v_player jsonb;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if p_gender not in ('male', 'female') then raise exception 'invalid_gender'; end if;
  if p_avatar_data is not null and (length(p_avatar_data) > 12000 or p_avatar_data not like 'data:image/webp;base64,%') then raise exception 'invalid_avatar'; end if;
  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 40 then raise exception 'invalid_display_name'; end if;
  select * into v_tournament from public.shared_tournaments where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.status not in ('registration', 'ready') then raise exception 'registration_closed'; end if;
  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  if v_count >= v_tournament.capacity then raise exception 'tournament_full'; end if;

  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role, gender)
  values (v_tournament.id, v_player_id, trim(p_display_name), 'manual', p_gender);
  v_player := jsonb_build_object('id', v_player_id, 'name', trim(p_display_name), 'manual', true, 'gender', p_gender);
  if p_avatar_data is not null then v_player := v_player || jsonb_build_object('photoDataUrl', p_avatar_data); end if;
  v_state := jsonb_set(v_tournament.state, '{players}', coalesce(v_tournament.state->'players', '[]'::jsonb)
    || jsonb_build_array(v_player), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now() where id = v_tournament.id;
  return jsonb_build_object('id', v_tournament.id, 'status', v_status, 'capacity', v_tournament.capacity,
    'state', v_state, 'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at,
    'canJoin', v_status = 'registration');
end;
$$;

create function public.add_shared_participant(p_tournament_id uuid, p_display_name text, p_gender text)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.add_shared_participant(p_tournament_id, p_display_name, p_gender, null); $$;
create function public.add_shared_participant(p_tournament_id uuid, p_display_name text)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$ select public.add_shared_participant(p_tournament_id, p_display_name, 'male', null); $$;

revoke all on function public.create_shared_tournament(text, integer, text, jsonb, text) from public;
revoke all on function public.join_shared_tournament(text, text, text, uuid, text) from public;
revoke all on function public.add_shared_participant(uuid, text, text, text) from public;
revoke all on function public.join_shared_tournament(text, text, text, uuid) from public;
revoke all on function public.join_shared_tournament(text, text, uuid) from public;
revoke all on function public.add_shared_participant(uuid, text, text) from public;
revoke all on function public.add_shared_participant(uuid, text) from public;
grant execute on function public.create_shared_tournament(text, integer, text, jsonb, text) to authenticated;
grant execute on function public.join_shared_tournament(text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.add_shared_participant(uuid, text, text, text) to authenticated;
grant execute on function public.join_shared_tournament(text, text, text, uuid) to anon, authenticated;
grant execute on function public.join_shared_tournament(text, text, uuid) to anon, authenticated;
grant execute on function public.add_shared_participant(uuid, text, text) to authenticated;
grant execute on function public.add_shared_participant(uuid, text) to authenticated;
