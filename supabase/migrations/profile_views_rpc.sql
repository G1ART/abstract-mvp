-- Profile views count + viewers list RPCs.
-- Run in Supabase SQL Editor.
-- Viewer list gated by entitlements.plan >= artist_pro.

-- Count (free): last N days
create or replace function get_profile_views_count(
  p_profile_id uuid,
  p_window_days int default 7
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*)::int into v_count
  from profile_views
  where profile_id = p_profile_id
    and created_at >= now() - (coalesce(nullif(p_window_days, 0), 7) || ' days')::interval;
  return coalesce(v_count, 0);
end;
$$;

-- Viewers list (pro only): profile owner + plan artist_pro+
create or replace function get_profile_viewers(
  p_profile_id uuid,
  p_limit int default 10,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_cursor_ts timestamptz;
  v_cursor_id bigint;
  v_decoded text;
  v_parts text[];
begin
  -- Must be profile owner
  if v_uid is null or not exists (
    select 1 from profiles where id = p_profile_id and id = v_uid
  ) then
    return;
  end if;

  -- Check entitlement
  select plan into v_plan from entitlements where user_id = v_uid;
  v_plan := coalesce(v_plan, 'free');
  if v_plan not in ('artist_pro', 'collector_pro') then
    return;
  end if;

  -- Parse cursor: base64("created_at|id")
  if p_cursor is not null and length(p_cursor) > 0 then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_parts := string_to_array(v_decoded, '|');
      if array_length(v_parts, 1) >= 2 then
        v_cursor_ts := v_parts[1]::timestamptz;
        v_cursor_id := v_parts[2]::bigint;
      end if;
    exception when others then
      v_cursor_ts := null;
      v_cursor_id := null;
    end;
  end if;

  return query
  select jsonb_build_object(
    'id', pv.id,
    'viewer_profile', jsonb_build_object(
      'id', pr.id,
      'username', pr.username,
      'display_name', pr.display_name,
      'avatar_url', pr.avatar_url,
      'main_role', pr.main_role,
      'roles', pr.roles
    ),
    'created_at', pv.created_at
  )
  from profile_views pv
  join profiles pr on pr.id = pv.viewer_id
  where pv.profile_id = p_profile_id
    and pv.viewer_id is not null
    and (v_cursor_ts is null or (pv.created_at, pv.id) < (v_cursor_ts, v_cursor_id))
  order by pv.created_at desc, pv.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;
