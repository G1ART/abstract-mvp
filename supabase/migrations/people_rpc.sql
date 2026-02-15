-- People recommended + search RPCs with cursor pagination.
-- Run in Supabase SQL Editor.
-- No full list: use get_recommended_people when q empty, search_people when q present.
-- Roles/cursor: NULL or invalid never raises; fallback when 0 results.

-- Recommended: excludes self + already followed, role filter, keyset pagination.
-- Fallback: when 0 results, return latest public profiles (exclude self only, relax follows).
create or replace function get_recommended_people(
  p_roles text[] default '{}',
  p_limit int default 15,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cursor_id uuid;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  -- Cursor: invalid or empty -> treat as first page (no raise)
  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
  else
    v_cursor_id := null;
  end if;

  return query
  with primary_result as (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'bio', p.bio,
      'main_role', p.main_role,
      'roles', p.roles,
      'is_public', p.is_public,
      'reason', 'role_match'
    )
    from profiles p
    where p.is_public = true
      and p.id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or p.main_role = any(v_roles) or p.roles && v_roles)
      and (v_uid is null or not exists (
        select 1 from follows f where f.follower_id = v_uid and f.following_id = p.id
      ))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by p.id desc
    limit v_limit
  ),
  fallback_result as (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'bio', p.bio,
      'main_role', p.main_role,
      'roles', p.roles,
      'is_public', p.is_public,
      'reason', 'fallback'
    )
    from profiles p
    where p.is_public = true
      and p.id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or p.main_role = any(v_roles) or p.roles && v_roles)
      and (v_cursor_id is null or p.id < v_cursor_id)
      and not exists (select 1 from primary_result limit 1)
    order by p.id desc
    limit v_limit
  )
  select * from primary_result
  union all
  select * from fallback_result;
end;
$$;

-- Search: q for username/display_name ilike, role filter, keyset pagination.
-- Empty q returns empty set. Roles/cursor NULL or invalid handled safely.
create or replace function search_people(
  p_q text,
  p_roles text[] default '{}',
  p_limit int default 15,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_pattern text;
  v_cursor_id uuid;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int;
begin
  if trim(coalesce(p_q, '')) = '' then
    return;
  end if;

  v_pattern := '%' || lower(trim(p_q)) || '%';
  v_limit := least(greatest(coalesce(p_limit, 15), 1), 50);

  -- Cursor: invalid or empty -> treat as first page (no raise)
  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
  else
    v_cursor_id := null;
  end if;

  return query
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'main_role', p.main_role,
    'roles', p.roles,
    'is_public', p.is_public,
    'reason', 'search'
  )
  from profiles p
  where p.is_public = true
    and (p.username ilike v_pattern or p.display_name ilike v_pattern)
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or p.main_role = any(v_roles) or p.roles && v_roles)
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit v_limit;
end;
$$;
