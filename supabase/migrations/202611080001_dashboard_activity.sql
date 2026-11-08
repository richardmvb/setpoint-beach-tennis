create or replace function public.get_dashboard_activity()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then raise exception 'dashboard_admin_required'; end if;

  with snapshots as (
    select id, 'shared'::text as source, status, state, updated_at, started_at is not null as started
    from public.shared_tournaments
    union all
    select id, 'local'::text, status, state, updated_at, nullif(state->>'startedAt', '') is not null
    from public.local_live_tournaments
  ), progress as (
    select snapshots.*,
      (select count(*) from jsonb_array_elements(
        case when jsonb_typeof(state->'rounds') = 'array' then state->'rounds' else '[]'::jsonb end
      ) as round_item, lateral jsonb_array_elements(
        case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
      ) as match_item) as matches_total,
      (select count(*) from jsonb_array_elements(
        case when jsonb_typeof(state->'rounds') = 'array' then state->'rounds' else '[]'::jsonb end
      ) as round_item, lateral jsonb_array_elements(
        case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
      ) as match_item where match_item->>'scoreA' is not null and match_item->>'scoreB' is not null) as matches_completed
    from snapshots
  ), active as (
    select * from progress where status = 'active' and started and nullif(state->>'finishedAt', '') is null
  ), abandoned as (
    select *, case
      when not started then 'registration'
      when jsonb_typeof(state->'finals') = 'object' then 'finals'
      when matches_total = 0 then 'unknown'
      when matches_completed = 0 then 'no_scores'
      when matches_completed * 2 < matches_total then 'under_half'
      when matches_completed < matches_total then 'over_half'
      else 'rounds_complete'
    end as stage
    from progress
    where source = 'shared' and status = 'archived' and nullif(state->>'finishedAt', '') is null
  )
  select jsonb_build_object(
    'active_tournaments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'source', source, 'name', coalesce(nullif(state->>'name', ''), 'Torneio'),
        'size', state->'size', 'mode', coalesce(state->>'tournamentMode', 'super'),
        'updated_at', updated_at, 'matches_completed', matches_completed, 'matches_total', matches_total
      ) order by updated_at desc) from active
    ), '[]'::jsonb),
    'archived_tournaments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'source', source, 'name', coalesce(nullif(state->>'name', ''), 'Torneio'),
        'size', state->'size', 'mode', coalesce(state->>'tournamentMode', 'super'),
        'updated_at', updated_at, 'matches_completed', matches_completed, 'matches_total', matches_total
      ) order by updated_at desc) from progress where source = 'shared' and status = 'archived'
    ), '[]'::jsonb),
    'abandoned_registration', (select count(*) from abandoned where stage = 'registration'),
    'abandoned_no_scores', (select count(*) from abandoned where stage = 'no_scores'),
    'abandoned_under_half', (select count(*) from abandoned where stage = 'under_half'),
    'abandoned_over_half', (select count(*) from abandoned where stage = 'over_half'),
    'abandoned_rounds_complete', (select count(*) from abandoned where stage = 'rounds_complete'),
    'abandoned_finals', (select count(*) from abandoned where stage = 'finals'),
    'abandoned_unknown', (select count(*) from abandoned where stage = 'unknown') +
      (select count(*) from public.local_tournament_metrics where status = 'abandoned')
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_dashboard_tournament(p_source text, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb;
  v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then raise exception 'dashboard_admin_required'; end if;

  if p_source = 'shared' then
    select state, status into v_state, v_status from public.shared_tournaments
    where id = p_tournament_id and status in ('active', 'completed', 'archived');
  elsif p_source = 'local' then
    select state, status into v_state, v_status from public.local_live_tournaments
    where id = p_tournament_id and status in ('active', 'completed');
  else
    raise exception 'invalid_tournament_source';
  end if;
  if not found then raise exception 'tournament_not_available'; end if;
  return jsonb_build_object('id', p_tournament_id, 'status', v_status, 'state', v_state);
end;
$$;

revoke all on function public.get_dashboard_activity() from public, anon, authenticated;
revoke all on function public.get_dashboard_tournament(text, uuid) from public, anon, authenticated;
grant execute on function public.get_dashboard_activity() to authenticated;
grant execute on function public.get_dashboard_tournament(text, uuid) to authenticated;