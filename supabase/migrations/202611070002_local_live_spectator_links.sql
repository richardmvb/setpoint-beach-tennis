create table if not exists public.local_live_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  read_token_hash text not null unique,
  write_token_hash text not null unique,
  state jsonb not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.local_live_tournaments enable row level security;
revoke all on public.local_live_tournaments from public, anon, authenticated;

create or replace function public.create_local_live_tournament(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_read_token text := encode(gen_random_bytes(32), 'hex');
  v_write_token text := encode(gen_random_bytes(32), 'hex');
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 500000 then raise exception 'invalid_tournament_state'; end if;
  if nullif(trim(p_state->>'name'), '') is null then raise exception 'invalid_tournament_state'; end if;

  v_state := p_state - 'analyticsId';
  insert into public.local_live_tournaments (id, owner_id, read_token_hash, write_token_hash, state, status)
  values (
    v_id,
    auth.uid(),
    encode(digest(v_read_token, 'sha256'), 'hex'),
    encode(digest(v_write_token, 'sha256'), 'hex'),
    v_state,
    case when nullif(v_state->>'finishedAt', '') is null then 'active' else 'completed' end
  );

  return jsonb_build_object('id', v_id, 'readToken', v_read_token, 'writeToken', v_write_token);
end;
$$;

create or replace function public.update_local_live_tournament(p_write_token text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.local_live_tournaments%rowtype;
  v_state jsonb;
  v_status text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if length(coalesce(p_write_token, '')) <> 64 then raise exception 'invalid_live_token'; end if;
  if jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 500000 then raise exception 'invalid_tournament_state'; end if;

  select * into v_tournament
  from public.local_live_tournaments
  where write_token_hash = encode(digest(p_write_token, 'sha256'), 'hex')
    and owner_id = auth.uid()
  for update;
  if not found then raise exception 'invalid_live_token'; end if;
  if v_tournament.status = 'completed' then raise exception 'tournament_completed'; end if;

  v_state := p_state - 'analyticsId';
  v_status := case when nullif(v_state->>'finishedAt', '') is null then 'active' else 'completed' end;
  update public.local_live_tournaments
  set state = v_state, status = v_status, updated_at = now()
  where id = v_tournament.id;

  return jsonb_build_object('id', v_tournament.id, 'status', v_status, 'state', v_state);
end;
$$;

create or replace function public.get_local_live_tournament(p_read_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tournament public.local_live_tournaments%rowtype;
begin
  if length(coalesce(p_read_token, '')) <> 64 then raise exception 'invalid_live_link'; end if;
  select * into v_tournament
  from public.local_live_tournaments
  where read_token_hash = encode(digest(p_read_token, 'sha256'), 'hex');
  if not found then raise exception 'invalid_live_link'; end if;
  return jsonb_build_object('id', v_tournament.id, 'status', v_tournament.status, 'state', v_tournament.state);
end;
$$;

revoke all on function public.create_local_live_tournament(jsonb) from public;
revoke all on function public.update_local_live_tournament(text, jsonb) from public;
revoke all on function public.get_local_live_tournament(text) from public;
grant execute on function public.create_local_live_tournament(jsonb) to authenticated;
grant execute on function public.update_local_live_tournament(text, jsonb) to authenticated;
grant execute on function public.get_local_live_tournament(text) to anon, authenticated;