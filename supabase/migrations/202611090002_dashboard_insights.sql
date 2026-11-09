-- Product insights for the admin dashboard: trend, funnel, format mix, usage by time of day,
-- feature adoption and retention, over the last p_days local days (with the previous period for comparison).
-- Reads shared tournaments and local tournaments (aggregate metrics, plus full detail when an archive exists).
-- Admin only, like the other dashboard RPCs.

create or replace function public.get_dashboard_insights(p_days integer default 30, p_tz text default 'America/Sao_Paulo')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_tz text := coalesce(nullif(p_tz, ''), 'America/Sao_Paulo');
  v_now timestamptz := now();
  v_from timestamptz;
  v_prev_from timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.setpoint_dashboard_admins where user_id = auth.uid()
  ) then raise exception 'dashboard_admin_required'; end if;

  -- The window is the last v_days local calendar days, today included.
  v_from := (date_trunc('day', v_now at time zone v_tz) - make_interval(days => v_days - 1)) at time zone v_tz;
  v_prev_from := v_from - make_interval(days => v_days);

  with base as (
    select 'shared'::text as source, t.id::text as tid, t.owner_id, t.status, t.created_at, t.started_at,
      nullif(t.state->>'finishedAt', '')::timestamptz as finished_at,
      coalesce(t.state->>'tournamentMode', 'super') as mode,
      t.capacity as size,
      coalesce(t.state->>'doublesFormat', 'open') as doubles,
      t.state as state,
      true as live,
      case when jsonb_typeof(t.state->'players') = 'array' then jsonb_array_length(t.state->'players') else 0 end as players
    from public.shared_tournaments t
    union all
    select 'local', m.tournament_id::text, m.owner_id, m.status, m.created_at, m.started_at, m.finished_at,
      m.tournament_mode, m.tournament_size, m.doubles_format, a.state,
      (a.live_tournament_id is not null),
      m.participant_count
    from public.local_tournament_metrics m
    left join public.local_tournament_archives a on a.tournament_id = m.tournament_id
  ), enriched as (
    select b.*,
      (b.state is not null) as has_state,
      case when b.state is null then 0 else (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(b.state->'rounds') = 'array' then b.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item) end as matches_total,
      case when b.state is null then 0 else (
        select count(*) from jsonb_array_elements(
          case when jsonb_typeof(b.state->'rounds') = 'array' then b.state->'rounds' else '[]'::jsonb end
        ) as round_item, lateral jsonb_array_elements(
          case when jsonb_typeof(round_item->'matches') = 'array' then round_item->'matches' else '[]'::jsonb end
        ) as match_item where match_item->>'scoreA' is not null and match_item->>'scoreB' is not null) end as matches_done,
      (b.state is not null and jsonb_typeof(b.state->'finals') = 'object') as reached_finals
    from base b
    where b.started_at is not null
  ), cur as (
    select * from enriched where started_at >= v_from
  ), prev as (
    select * from enriched where started_at >= v_prev_from and started_at < v_from
  ), owner_first as (
    select owner_id, min(started_at) as first_started, count(*) as tournaments from enriched group by owner_id
  ), detailed as (
    -- Rows whose progress is known: archived/shared state, or already finished.
    select * from cur where has_state or finished_at is not null
  )
  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_now, 'timezone', v_tz),
    'kpis', jsonb_build_object(
      'current', jsonb_build_object(
        'started', (select count(*) from cur),
        'finished', (select count(*) from cur where finished_at is not null),
        'completion_rate', (select round(100.0 * count(*) filter (where finished_at is not null) / nullif(count(*), 0), 1) from cur),
        'players', (select coalesce(sum(players), 0) from cur),
        'avg_players', (select round(avg(nullif(players, 0)), 1) from cur),
        'matches_scored', (select coalesce(sum(matches_done), 0) from cur),
        'moderators', (select count(distinct owner_id) from cur),
        'new_moderators', (select count(*) from owner_first where first_started >= v_from)
      ),
      'previous', jsonb_build_object(
        'started', (select count(*) from prev),
        'finished', (select count(*) from prev where finished_at is not null),
        'completion_rate', (select round(100.0 * count(*) filter (where finished_at is not null) / nullif(count(*), 0), 1) from prev),
        'players', (select coalesce(sum(players), 0) from prev),
        'avg_players', (select round(avg(nullif(players, 0)), 1) from prev),
        'matches_scored', (select coalesce(sum(matches_done), 0) from prev),
        'moderators', (select count(distinct owner_id) from prev),
        'new_moderators', (select count(*) from owner_first where first_started >= v_prev_from and first_started < v_from)
      )
    ),
    'duration', jsonb_build_object(
      'median_seconds', (select round(percentile_cont(0.5) within group (order by extract(epoch from finished_at - started_at)))::integer
        from cur where finished_at is not null and finished_at >= started_at),
      'p90_seconds', (select round(percentile_cont(0.9) within group (order by extract(epoch from finished_at - started_at)))::integer
        from cur where finished_at is not null and finished_at >= started_at)
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d::date, 'started', coalesce(s.total, 0), 'shared', coalesce(s.shared, 0), 'finished', coalesce(f.total, 0)
      ) order by d)
      from generate_series(
        date_trunc('day', v_now at time zone v_tz) - make_interval(days => v_days - 1),
        date_trunc('day', v_now at time zone v_tz), interval '1 day') d
      left join (
        select date_trunc('day', started_at at time zone v_tz) as day, count(*) as total, count(*) filter (where source = 'shared') as shared
        from cur group by 1
      ) s on s.day = d
      left join (
        select date_trunc('day', finished_at at time zone v_tz) as day, count(*) as total
        from enriched where finished_at is not null and finished_at >= v_from group by 1
      ) f on f.day = d
    ), '[]'::jsonb),
    'mix', jsonb_build_object(
      'mode', coalesce((select jsonb_object_agg(mode, c) from (select mode, count(*) as c from cur group by mode) x), '{}'::jsonb),
      'size', coalesce((select jsonb_object_agg(size::text, c) from (select size, count(*) as c from cur group by size) x), '{}'::jsonb),
      'doubles', coalesce((select jsonb_object_agg(doubles, c) from (select doubles, count(*) as c from cur group by doubles) x), '{}'::jsonb),
      'hosting', coalesce((select jsonb_object_agg(source, c) from (select source, count(*) as c from cur group by source) x), '{}'::jsonb)
    ),
    'formats', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'size', size, 'doubles', doubles, 'started', started, 'finished', finished) order by started desc, mode, size)
      from (
        select mode, size, doubles, count(*) as started, count(*) filter (where finished_at is not null) as finished
        from enriched group by mode, size, doubles order by count(*) desc limit 8
      ) f
    ), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'basis', (select count(*) from detailed),
      'started', (select count(*) from detailed),
      'with_scores', (select count(*) from detailed where matches_done > 0 or finished_at is not null),
      'half_played', (select count(*) from detailed where (matches_total > 0 and matches_done * 2 >= matches_total) or finished_at is not null),
      'rounds_done', (select count(*) from detailed where (matches_total > 0 and matches_done = matches_total) or reached_finals or finished_at is not null),
      'reached_finals', (select count(*) from detailed where reached_finals or finished_at is not null),
      'finished', (select count(*) from detailed where finished_at is not null)
    ),
    'registration', jsonb_build_object(
      'created', (select count(*) from public.shared_tournaments where created_at >= v_from),
      'started', (select count(*) from public.shared_tournaments where created_at >= v_from and started_at is not null),
      'expired', (select count(*) from public.shared_tournaments where created_at >= v_from and started_at is null and status = 'archived'),
      'avg_guests', (
        select round(avg(guests), 1) from (
          select count(*) filter (where p.role in ('guest', 'manual')) as guests
          from public.shared_tournaments t left join public.shared_tournament_participants p on p.tournament_id = t.id
          where t.started_at >= v_from group by t.id
        ) g
      )
    ),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c))
      from (
        select extract(dow from started_at at time zone v_tz)::int as dow, extract(hour from started_at at time zone v_tz)::int as hr, count(*) as c
        from cur group by 1, 2
      ) h
    ), '[]'::jsonb),
    'adoption', jsonb_build_object(
      'live_link', jsonb_build_object('used', (select count(*) from cur where live), 'of', (select count(*) from cur)),
      'qualification', jsonb_build_object(
        'used', (select count(*) from cur where source = 'shared' and mode = 'super' and state->>'qualificationStats' = 'true'),
        'of', (select count(*) from cur where source = 'shared' and mode = 'super')),
      'early_finals', jsonb_build_object(
        'used', (select count(*) from cur where has_state and size = 24 and doubles = 'mixed' and state->>'earlyFinalsEnabled' = 'true'),
        'of', (select count(*) from cur where has_state and size = 24 and doubles = 'mixed')),
      'point_by_point', jsonb_build_object(
        'used', (select count(*) from cur where reached_finals and exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(state->'finals'->'matches') = 'array' then state->'finals'->'matches' else '[]'::jsonb end) fm
          where jsonb_typeof(fm->'livePoints') = 'array')),
        'of', (select count(*) from cur where reached_finals)),
      'mixed_doubles', jsonb_build_object('used', (select count(*) from cur where doubles = 'mixed'), 'of', (select count(*) from cur)),
      'fixed_pairs', jsonb_build_object(
        'used', (select count(*) from cur where mode = 'groups' and state->>'groupFormat' = 'fixed'),
        'of', (select count(*) from cur where mode = 'groups' and has_state))
    ),
    'retention', jsonb_build_object(
      'moderators_total', (select count(*) from owner_first),
      'one_time', (select count(*) from owner_first where tournaments = 1),
      'two', (select count(*) from owner_first where tournaments = 2),
      'three_plus', (select count(*) from owner_first where tournaments >= 3),
      'active_new', (select count(*) from owner_first where first_started >= v_from),
      'active_returning', (select count(distinct c.owner_id) from cur c join owner_first f on f.owner_id = c.owner_id where f.first_started < v_from)
    ),
    'coverage', jsonb_build_object(
      'local_started', (select count(*) from cur where source = 'local'),
      'local_with_detail', (select count(*) from cur where source = 'local' and has_state)
    ),
    'generated_at', v_now
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_insights(integer, text) from public, anon, authenticated;
grant execute on function public.get_dashboard_insights(integer, text) to authenticated;
