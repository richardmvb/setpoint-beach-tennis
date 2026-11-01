-- Apaga o torneio e, por cascata, todos os participantes.
create or replace function public.cancel_shared_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'moderator_auth_required'; end if;
  delete from public.shared_tournaments where id = p_tournament_id and owner_id = auth.uid();
  if not found then raise exception 'moderator_only'; end if;
end;
$$;

revoke all on function public.cancel_shared_tournament(uuid) from public;
grant execute on function public.cancel_shared_tournament(uuid) to authenticated;
