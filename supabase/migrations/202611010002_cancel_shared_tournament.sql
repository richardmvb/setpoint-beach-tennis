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

revoke all on function public.cancel_shared_tournament(uuid) from public;
grant execute on function public.cancel_shared_tournament(uuid) to authenticated;
