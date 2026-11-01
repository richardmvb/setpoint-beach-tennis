alter table public.shared_tournament_participants
  drop constraint if exists shared_tournament_participants_role_check;
alter table public.shared_tournament_participants
  add constraint shared_tournament_participants_role_check
  check (role in ('moderator', 'guest', 'manual'));

create or replace function public.add_shared_participant(p_tournament_id uuid, p_display_name text)
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
  if nullif(trim(p_display_name), '') is null or char_length(trim(p_display_name)) > 40 then raise exception 'invalid_display_name'; end if;

  select * into v_tournament from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.status not in ('registration', 'ready') then raise exception 'registration_closed'; end if;

  select count(*) into v_count from public.shared_tournament_participants where tournament_id = v_tournament.id;
  if v_count >= v_tournament.capacity then raise exception 'tournament_full'; end if;

  insert into public.shared_tournament_participants (tournament_id, player_id, display_name, role)
  values (v_tournament.id, v_player_id, trim(p_display_name), 'manual');

  v_state := jsonb_set(v_tournament.state, '{players}',
    coalesce(v_tournament.state->'players', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('id', v_player_id, 'name', trim(p_display_name), 'manual', true)), true);
  v_status := case when v_count + 1 = v_tournament.capacity then 'ready' else 'registration' end;
  update public.shared_tournaments set state = v_state, status = v_status, updated_at = now()
  where id = v_tournament.id;

  return jsonb_build_object('id', v_tournament.id, 'status', v_status,
    'capacity', v_tournament.capacity, 'state', v_state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at,
    'canJoin', v_status = 'registration');
end;
$$;

create or replace function public.remove_shared_participant(p_tournament_id uuid, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
  v_state jsonb;
  v_invite_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  select * into v_tournament from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only'; end if;
  if v_tournament.status not in ('registration', 'ready') then raise exception 'registration_closed'; end if;

  delete from public.shared_tournament_participants
  where tournament_id = v_tournament.id and player_id = p_player_id and role = 'manual';
  if not found then raise exception 'participant_not_removable'; end if;

  v_state := jsonb_set(v_tournament.state, '{players}',
    coalesce((select jsonb_agg(p) from jsonb_array_elements(v_tournament.state->'players') p
      where p->>'id' <> p_player_id), '[]'::jsonb), true);
  -- Voltar a 'registration' reinicia o prazo para a limpeza agendada não apagar o torneio.
  v_invite_expires_at := greatest(v_tournament.invite_expires_at, now() + interval '15 minutes');
  update public.shared_tournaments set state = v_state, status = 'registration',
    invite_expires_at = v_invite_expires_at, updated_at = now()
  where id = v_tournament.id;

  return jsonb_build_object('id', v_tournament.id, 'status', 'registration',
    'capacity', v_tournament.capacity, 'state', v_state,
    'inviteExpiresAt', v_invite_expires_at, 'expiresAt', v_tournament.expires_at, 'canJoin', true);
end;
$$;

-- Após gerar as finais, as rodadas deixam de aceitar alterações no servidor.
create or replace function public.save_shared_tournament(p_tournament_id uuid, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.shared_tournaments%rowtype;
  v_tournament public.shared_tournaments%rowtype;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  select * into v_old from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid() and status = 'active' and now() < expires_at for update;
  if not found then raise exception 'moderator_only_or_tournament_expired'; end if;
  if jsonb_typeof(v_old.state->'finals') = 'object'
     and p_state->'rounds' is distinct from v_old.state->'rounds' then
    raise exception 'rounds_locked';
  end if;

  update public.shared_tournaments set state = p_state,
    status = case when p_state->>'finishedAt' is not null then 'completed' else status end,
    updated_at = now()
  where id = p_tournament_id returning * into v_tournament;

  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
end;
$$;

revoke all on function public.add_shared_participant(uuid, text) from public;
revoke all on function public.remove_shared_participant(uuid, text) from public;
grant execute on function public.add_shared_participant(uuid, text) to authenticated;
grant execute on function public.remove_shared_participant(uuid, text) to authenticated;
