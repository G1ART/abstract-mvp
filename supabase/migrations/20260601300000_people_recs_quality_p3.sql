-- People tab — Trending RPC + Dead-Code Drop (P3)
--
-- Final pass on the People tab quality program. Two small, optional
-- changes:
--
--   S4.  `get_trending_people(p_limit)` — surfaces accounts that
--        gained the most accepted-follows in the last 7 days. Used
--        by the People tab when the search input is focused but
--        empty, to give the user something to click on instead of a
--        bare empty state.
--
--   D.   Drop the dead RPCs that no client calls today:
--        - `get_recommended_people(text[], int, text)`  — superseded
--          by `get_people_recs(p_mode='likes_based', ...)` long ago.
--        - `search_people(text, text[], int, text, boolean)` — the
--          5-arg fuzzy variant that was wired in
--          `p0_search_fuzzy_pg_trgm.sql` but never adopted by the
--          client. The 4-arg variant now does fuzzy matching itself
--          (P1 migration).
--
-- Run AFTER P0 + P1 + P2.

begin;

---------------------------------------------------------------------------
-- 1. get_trending_people
---------------------------------------------------------------------------

-- "Trending" is intentionally simple — accepted follows received in
-- the last 7 days, biased toward presentable, public profiles. A more
-- exotic ranking (engagement velocity / artwork virality) can layer
-- on later; the goal here is to give a focused-empty search a
-- meaningful answer instead of a static curation list.
create or replace function public.get_trending_people(
  p_limit int default 8
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 24);
  v_since timestamptz := now() - interval '7 days';
begin
  return query
  with new_followers as (
    select f.following_id as candidate_id,
           count(*)::int as recent_followers
    from public.follows f
    where f.status = 'accepted'
      and f.created_at >= v_since
      and f.following_id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
    group by f.following_id
  )
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'main_role', p.main_role,
    'roles', p.roles,
    'is_public', p.is_public,
    'reason_tags', '["trending"]'::jsonb,
    'reason_detail', jsonb_build_object('recent_followers', nf.recent_followers),
    'mutual_follow_sources', 0,
    'liked_artists_count', 0,
    'mutual_avatars', '[]'::jsonb,
    'signal_count', nf.recent_followers,
    'top_signal', 'trending',
    'is_recently_active', (p.last_active_at is not null and p.last_active_at > now() - interval '14 days')
  )
  from new_followers nf
  join public.profiles p on p.id = nf.candidate_id
  where p.is_public = true
    and public.is_presentable_profile(p.display_name, p.username)
    and (
      v_uid is null
      or p.id not in (
        select following_id from public.follows
        where follower_id = v_uid and status = 'accepted'
      )
    )
    and (
      v_uid is null
      or p.id not in (
        select target_id from public.people_dismissals
        where user_id = v_uid
          and (expires_at is null or expires_at > now())
      )
    )
  order by nf.recent_followers desc, p.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_trending_people(int) to authenticated;
grant execute on function public.get_trending_people(int) to anon;

---------------------------------------------------------------------------
-- 2. Drop dead RPCs (D)
---------------------------------------------------------------------------

-- Superseded by `get_people_recs(p_mode='likes_based', ...)`. No
-- client has called this since the lanes RPC went live.
drop function if exists public.get_recommended_people(text[], int, text);

-- Superseded by the 4-arg `search_people(text, text[], int, text)`
-- which now does fuzzy matching internally (P1 migration). The
-- 5-arg signature was never wired in any client.
drop function if exists public.search_people(text, text[], int, text, boolean);

commit;
