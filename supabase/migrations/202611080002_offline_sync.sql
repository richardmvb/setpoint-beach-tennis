create or replace function public.sync_shared_tournament(p_tournament_id uuid, p_base_state jsonb, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament public.shared_tournaments%rowtype;
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_base_state) is distinct from 'object' then
    raise exception 'invalid_tournament_state';
  end if;
  select * into v_tournament from public.shared_tournaments
  where id = p_tournament_id and owner_id = auth.uid() for update;
  if not found then raise exception 'moderator_only_or_tournament_expired'; end if;
  if v_tournament.status in ('active', 'completed') and v_tournament.state = p_state then
    return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
      'capacity', v_tournament.capacity, 'state', v_tournament.state,
      'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
  end if;
  if v_tournament.status <> 'active' or v_tournament.expires_at is null or now() >= v_tournament.expires_at then
    raise exception 'moderator_only_or_tournament_expired';
  end if;
  if v_tournament.state is distinct from p_base_state then raise exception 'sync_conflict'; end if;
  if jsonb_typeof(v_tournament.state->'finals') = 'object'
    and p_state->'rounds' is distinct from v_tournament.state->'rounds' then raise exception 'rounds_locked'; end if;

  update public.shared_tournaments set state = p_state,
    status = case when p_state->>'finishedAt' is not null then 'completed' else 'active' end,
    updated_at = now()
  where id = v_tournament.id returning * into v_tournament;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status,
    'capacity', v_tournament.capacity, 'state', v_tournament.state,
    'inviteExpiresAt', v_tournament.invite_expires_at, 'expiresAt', v_tournament.expires_at);
end;
$$;

create or replace function public.sync_local_live_tournament(p_write_token text, p_base_state jsonb, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.local_live_tournaments%rowtype;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if length(coalesce(p_write_token, '')) <> 64 then raise exception 'invalid_live_token'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_base_state) is distinct from 'object'
    or octet_length(p_state::text) > 500000 then raise exception 'invalid_tournament_state'; end if;
  v_state := p_state - 'analyticsId';
  select * into v_tournament from public.local_live_tournaments
  where write_token_hash = encode(digest(p_write_token, 'sha256'), 'hex') and owner_id = auth.uid() for update;
  if not found then raise exception 'invalid_live_token'; end if;
  if v_tournament.state = v_state then
    return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status, 'state', v_tournament.state);
  end if;
  if v_tournament.status = 'completed' then raise exception 'tournament_completed'; end if;
  if v_tournament.state is distinct from p_base_state then raise exception 'sync_conflict'; end if;

  update public.local_live_tournaments set state = v_state,
    status = case when nullif(v_state->>'finishedAt', '') is null then 'active' else 'completed' end,
    updated_at = now()
  where id = v_tournament.id returning * into v_tournament;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status, 'state', v_tournament.state);
end;
$$;

revoke all on function public.sync_shared_tournament(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.sync_local_live_tournament(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_shared_tournament(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.sync_local_live_tournament(text, jsonb, jsonb) to authenticated;