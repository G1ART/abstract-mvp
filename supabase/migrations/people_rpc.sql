-- People recommended + search RPCs with cursor pagination.
-- Run in Supabase SQL Editor.
-- No full list: use get_recommended_people when q empty, search_people when q present.
-- Note: profiles table must have id. Uses id for keyset (stable ordering).

-- Recommended: excludes self + already followed, role filter, keyset pagination
create or replace function get_recommended_people(
  p_roles text[] default '{}',
  p_limit int default 15,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cursor_id uuid;
begin
  if p_cursor is not null and length(p_cursor) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
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
    'reason', 'role_match'
  )
  from profiles p
  where p.is_public = true
    and p.id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
    and (array_length(p_roles, 1) is null or array_length(p_roles, 1) = 0
         or p.main_role = any(p_roles) or p.roles && p_roles)
    and (v_uid is null or not exists (
      select 1 from follows f where f.follower_id = v_uid and f.following_id = p.id
    ))
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
end;
$$;

-- Search: q for username/display_name ilike, role filter, keyset pagination
create or replace function search_people(
  p_q text,
  p_roles text[] default '{}',
  p_limit int default 15,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern text := '%' || coalesce(lower(trim(nullif(p_q, ''))), '') || '%';
  v_cursor_id uuid;
begin
  if trim(coalesce(p_q, '')) = '' then
    return;
  end if;

  if p_cursor is not null and length(p_cursor) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
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
    and (array_length(p_roles, 1) is null or array_length(p_roles, 1) = 0
         or p.main_role = any(p_roles) or p.roles && p_roles)
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
end;
$$;
