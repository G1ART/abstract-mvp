-- People 3-lane recs RPC.
-- Run in Supabase SQL Editor.
-- get_people_recs(mode, roles, limit, cursor)
-- Modes: follow_graph | likes_based | expand

create or replace function public.get_people_recs(
  p_mode text,
  p_roles text[] default null,
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
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int := least(greatest(coalesce(p_limit, 15), 1), 50);
  v_cursor_id uuid;
  v_mode text := lower(coalesce(trim(p_mode), 'follow_graph'));
begin
  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
  else
    v_cursor_id := null;
  end if;

  -- Non-logged-in or invalid mode: fallback to latest public profiles
  if v_uid is null then
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public,
      'reason_tags', '{}'::jsonb,
      'reason_detail', '{}'::jsonb,
      'mutual_follow_sources', 0,
      'liked_artists_count', 0
    )
    from profiles p
    where p.is_public = true
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by p.id desc
    limit v_limit;
    return;
  end if;

  -- follow_graph: 2-hop (people my follows follow)
  if v_mode = 'follow_graph' then
    return query
    with two_hop as (
      select f2.following_id as candidate_id,
        count(distinct f2.follower_id)::int as mutual_sources
      from follows f1
      join follows f2 on f2.follower_id = f1.following_id
      where f1.follower_id = v_uid
        and f2.following_id != v_uid
        and f2.following_id not in (select following_id from follows where follower_id = v_uid)
      group by f2.following_id
    )
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public,
      'reason_tags', '["follow_graph"]'::jsonb,
      'reason_detail', jsonb_build_object('mutual_follow_sources', th.mutual_sources),
      'mutual_follow_sources', th.mutual_sources,
      'liked_artists_count', 0
    )
    from two_hop th
    join profiles p on p.id = th.candidate_id
    where p.is_public = true
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by th.mutual_sources desc, p.id desc
    limit v_limit;
    return;
  end if;

  -- likes_based: artists from liked artworks; fallback to latest when no likes
  if v_mode = 'likes_based' then
    return query
    with liked_artists as (
      select a.artist_id,
        count(*)::int as cnt
      from artwork_likes al
      join artworks a on a.id = al.artwork_id and a.visibility = 'public'
      where al.user_id = v_uid
      group by a.artist_id
    ),
    primary_rows as (
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public, c.liked_cnt
      from (
        select la.artist_id as candidate_id, la.cnt as liked_cnt
        from liked_artists la
        where la.artist_id != v_uid
          and la.artist_id not in (select following_id from follows where follower_id = v_uid)
      ) c
      join profiles p on p.id = c.candidate_id
      where p.is_public = true
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and (v_cursor_id is null or p.id < v_cursor_id)
      order by c.liked_cnt desc, p.id desc
      limit v_limit
    ),
    fallback_rows as (
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public, 0::int as liked_cnt
      from profiles p
      where p.is_public = true and p.id != v_uid
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and not exists (select 1 from follows f where f.follower_id = v_uid and f.following_id = p.id)
        and (v_cursor_id is null or p.id < v_cursor_id)
        and not exists (select 1 from liked_artists limit 1)
      order by p.id desc
      limit v_limit
    )
    select jsonb_build_object(
      'id', r.id, 'username', r.username, 'display_name', r.display_name,
      'avatar_url', r.avatar_url, 'bio', r.bio, 'main_role', r.main_role,
      'roles', r.roles, 'is_public', r.is_public,
      'reason_tags', case when r.liked_cnt > 0 then '["likes_based"]'::jsonb else '["fallback"]'::jsonb end,
      'reason_detail', case when r.liked_cnt > 0 then jsonb_build_object('liked_artists_count', r.liked_cnt) else '{}'::jsonb end,
      'mutual_follow_sources', 0,
      'liked_artists_count', r.liked_cnt
    )
    from (
      select * from primary_rows
      union all
      select * from fallback_rows
    ) r
    order by r.liked_cnt desc, r.id desc
    limit v_limit;
    return;
  end if;

  -- expand: diversity from likes_based seed; fallback to latest when no seed
  if v_mode = 'expand' then
    return query
    with liked_seed as (
      select distinct a.artist_id
      from artwork_likes al
      join artworks a on a.id = al.artwork_id
      where al.user_id = v_uid
      limit 20
    ),
    expand_rows as (
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public
      from profiles p
      where p.is_public = true and p.id != v_uid
        and p.id not in (select following_id from follows where follower_id = v_uid)
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and (v_cursor_id is null or p.id < v_cursor_id)
        and (
          (p.id not in (select artist_id from liked_seed) and exists (select 1 from liked_seed limit 1))
          or not exists (select 1 from liked_seed limit 1)
        )
      order by p.id desc
      limit v_limit
    )
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public,
      'reason_tags', '["expand"]'::jsonb,
      'reason_detail', jsonb_build_object('note', 'adjacent discovery'),
      'mutual_follow_sources', 0,
      'liked_artists_count', 0
    )
    from expand_rows er
    join profiles p on p.id = er.id
    order by p.id desc;
    return;
  end if;

  -- expand fallback or unknown mode: latest public
  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public,
    'reason_tags', '["fallback"]'::jsonb,
    'reason_detail', '{}'::jsonb,
    'mutual_follow_sources', 0,
    'liked_artists_count', 0
  )
  from profiles p
  where p.is_public = true and p.id != v_uid
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
    and not exists (select 1 from follows f where f.follower_id = v_uid and f.following_id = p.id)
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_people_recs(text, text[], int, text) to authenticated;
grant execute on function public.get_people_recs(text, text[], int, text) to anon;
