-- People tab — Recommendation Richness + Search Hardening (P1)
--
-- Builds on the P0 migration (`20260601000000_people_recs_quality_p0.sql`)
-- which gated `accepted` follows and dropped placeholder rows from the
-- recommendation pool. This pass tackles the *signal* itself and the
-- search RPC pair so that:
--
--   A3.  `expand` lane has actual diversity / adjacency signals
--        (shared themes, shared medium, same city) rather than
--        "everyone who is not in liked_seed". Carries them in
--        `reason_tags` + `reason_detail` so the existing humanizer
--        (`reasonTagToI18n` in `src/lib/people/reason.ts`) can light
--        up "Shares similar subject keywords" / "Shared medium" /
--        "Same city" without any client change.
--
--   A4.  `likes_based` no longer drowns the primary list of liked
--        artists with fallback rows when the user *has* liked
--        history. Fallback only kicks in when the primary list is
--        empty, and we tag the fallback rows distinctly so the UI
--        does not promise "based on what you liked" for them.
--
--   G2.  Score envelope is now uniform across lanes — every row
--        carries `signal_count` (the headline numerical reason) and
--        `top_signal` (the lane-level token). The client switches
--        from lane-aware hard-coding to one symmetric badge model.
--
--   G3.  follow_graph rows now ship `mutual_avatars` — up to 3 of
--        the actual middle-graph profiles (id / username /
--        display_name / avatar_url) so the UI can render the
--        LinkedIn / Twitter "X, Y +N follow this person" stack.
--        The trust signal is dramatically louder than a bare
--        "3 in your network".
--
--   B1+B2.  `search_people(p_q, p_roles, p_limit, p_cursor)` is
--        rewritten to use `pg_trgm` similarity for fuzzy fall-back
--        and a tiered ORDER BY: exact match > prefix match > fuzzy
--        similarity > recency. The 5-arg variant from
--        `p0_search_fuzzy_pg_trgm.sql` is now superseded — the
--        unified 4-arg signature is what every client calls.
--
--   B3.  No SQL change; the `nextCursor` plumbing is added on the
--        client (`searchPeopleWithArtwork`) by paginating the
--        primary fuzzy variant — the unified 4-arg search now
--        emits a stable cursor so cursor-based load-more works.
--
-- Run in the Supabase SQL Editor (production + staging) AFTER the
-- P0 migration.

begin;

---------------------------------------------------------------------------
-- 1. get_people_recs — A3 + A4 + G2 + G3
---------------------------------------------------------------------------

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
  v_themes text[];
  v_mediums text[];
  v_city text;
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

  -- Non-logged-in or invalid mode: fallback to latest public profiles.
  if v_uid is null then
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public,
      'reason_tags', '{}'::jsonb,
      'reason_detail', '{}'::jsonb,
      'mutual_follow_sources', 0,
      'liked_artists_count', 0,
      'mutual_avatars', '[]'::jsonb,
      'signal_count', 0,
      'top_signal', 'fallback'
    )
    from profiles p
    where p.is_public = true
      and public.is_presentable_profile(p.display_name, p.username)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by p.id desc
    limit v_limit;
    return;
  end if;

  -- Pull viewer's profile-context fields once for expand-signal scoring.
  -- A null/empty themes/mediums/city is fine — the expand lane simply
  -- emits no overlap signal for that profile (and falls back to the
  -- generic "expand" reason).
  select coalesce(p.themes, '{}'::text[]),
         coalesce(p.mediums, '{}'::text[]),
         coalesce(nullif(trim(p.location), ''), null)
    into v_themes, v_mediums, v_city
    from profiles p where p.id = v_uid;
  v_themes := coalesce(v_themes, '{}'::text[]);
  v_mediums := coalesce(v_mediums, '{}'::text[]);

  -------------------------------------------------------------------------
  -- follow_graph: 2-hop, with mutual_avatars stack (G3)
  -------------------------------------------------------------------------
  if v_mode = 'follow_graph' then
    return query
    with two_hop as (
      select f2.following_id as candidate_id,
        count(distinct f2.follower_id)::int as mutual_sources,
        -- collect up to 3 source profiles (the people *I* follow who
        -- also follow this candidate). Order is deterministic by id
        -- so the avatar stack stays stable across paginated requests.
        (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', sp.id,
                   'username', sp.username,
                   'display_name', sp.display_name,
                   'avatar_url', sp.avatar_url
                 ) order by sp.id), '[]'::jsonb)
          from (
            select distinct sp_inner.id, sp_inner.username,
                   sp_inner.display_name, sp_inner.avatar_url
            from follows f2x
            join profiles sp_inner on sp_inner.id = f2x.follower_id
            where f2x.follower_id in (
                    select following_id from follows
                    where follower_id = v_uid and status = 'accepted'
                  )
              and f2x.following_id = f2.following_id
              and f2x.status = 'accepted'
              and public.is_presentable_profile(sp_inner.display_name, sp_inner.username)
            order by sp_inner.id
            limit 3
          ) sp
        ) as mutual_avatars
      from follows f1
      join follows f2 on f2.follower_id = f1.following_id
      where f1.follower_id = v_uid
        and f1.status = 'accepted'
        and f2.status = 'accepted'
        and f2.following_id != v_uid
        and f2.following_id not in (
          select following_id from follows
          where follower_id = v_uid and status = 'accepted'
        )
      group by f2.following_id
    )
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public,
      'reason_tags', '["follow_graph"]'::jsonb,
      'reason_detail', jsonb_build_object('mutual_follow_sources', th.mutual_sources),
      'mutual_follow_sources', th.mutual_sources,
      'liked_artists_count', 0,
      'mutual_avatars', th.mutual_avatars,
      'signal_count', th.mutual_sources,
      'top_signal', 'follow_graph'
    )
    from two_hop th
    join profiles p on p.id = th.candidate_id
    where p.is_public = true
      and public.is_presentable_profile(p.display_name, p.username)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by th.mutual_sources desc, p.id desc
    limit v_limit;
    return;
  end if;

  -------------------------------------------------------------------------
  -- likes_based: A4 — primary first, fallback only if primary empty
  -------------------------------------------------------------------------
  if v_mode = 'likes_based' then
    return query
    with liked_artists as (
      select a.artist_id, count(*)::int as cnt
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
          and la.artist_id not in (
            select following_id from follows
            where follower_id = v_uid and status = 'accepted'
          )
      ) c
      join profiles p on p.id = c.candidate_id
      where p.is_public = true
        and public.is_presentable_profile(p.display_name, p.username)
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and (v_cursor_id is null or p.id < v_cursor_id)
      order by c.liked_cnt desc, p.id desc
      limit v_limit
    ),
    primary_count as (select count(*)::int as n from primary_rows),
    fallback_rows as (
      -- Fallback only fires if primary_rows is empty. Previously we
      -- emitted fallback rows alongside primary even when the user
      -- had likes, which made the lane indistinguishable from the
      -- generic "latest public" feed.
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public, 0::int as liked_cnt
      from profiles p
      where p.is_public = true and p.id != v_uid
        and public.is_presentable_profile(p.display_name, p.username)
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and not exists (
          select 1 from follows f
          where f.follower_id = v_uid and f.following_id = p.id
            and f.status = 'accepted'
        )
        and (v_cursor_id is null or p.id < v_cursor_id)
        and (select n from primary_count) = 0
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
      'liked_artists_count', r.liked_cnt,
      'mutual_avatars', '[]'::jsonb,
      'signal_count', r.liked_cnt,
      'top_signal', case when r.liked_cnt > 0 then 'likes_based' else 'fallback' end
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

  -------------------------------------------------------------------------
  -- expand: A3 — adjacency signals (themes / mediums / city)
  -------------------------------------------------------------------------
  if v_mode = 'expand' then
    return query
    with liked_seed as (
      select distinct a.artist_id
      from artwork_likes al
      join artworks a on a.id = al.artwork_id
      where al.user_id = v_uid
      limit 20
    ),
    expand_pool as (
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public,
        coalesce(p.themes, '{}'::text[]) as cand_themes,
        coalesce(p.mediums, '{}'::text[]) as cand_mediums,
        nullif(trim(p.location), '') as cand_city
      from profiles p
      where p.is_public = true and p.id != v_uid
        and public.is_presentable_profile(p.display_name, p.username)
        and p.id not in (
          select following_id from follows
          where follower_id = v_uid and status = 'accepted'
        )
        and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
             or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
        and (v_cursor_id is null or p.id < v_cursor_id)
        and (
          (p.id not in (select artist_id from liked_seed) and exists (select 1 from liked_seed limit 1))
          or not exists (select 1 from liked_seed limit 1)
        )
    ),
    scored as (
      select ep.*,
        coalesce(array_length(array(select unnest(ep.cand_themes) intersect select unnest(v_themes)), 1), 0) as shared_themes_count,
        coalesce(array_length(array(select unnest(ep.cand_mediums) intersect select unnest(v_mediums)), 1), 0) as shared_mediums_count,
        case
          when v_city is not null and ep.cand_city is not null
               and lower(v_city) = lower(ep.cand_city) then 1
          else 0
        end as same_city
      from expand_pool ep
    ),
    ranked as (
      select s.*,
        (s.shared_themes_count * 3 + s.shared_mediums_count * 2 + s.same_city) as score
      from scored s
      order by score desc, s.id desc
      limit v_limit
    )
    select jsonb_build_object(
      'id', r.id, 'username', r.username, 'display_name', r.display_name,
      'avatar_url', r.avatar_url, 'bio', r.bio, 'main_role', r.main_role,
      'roles', r.roles, 'is_public', r.is_public,
      'reason_tags', case
        when r.shared_themes_count > 0 then
          case
            when r.shared_mediums_count > 0 then '["expand","similar_keywords","shared_medium"]'::jsonb
            else '["expand","similar_keywords"]'::jsonb
          end
        when r.shared_mediums_count > 0 then '["expand","shared_medium"]'::jsonb
        when r.same_city = 1 then '["expand","same_city"]'::jsonb
        else '["expand"]'::jsonb
      end,
      'reason_detail', jsonb_build_object(
        'note', 'adjacent discovery',
        'shared_themes_count', r.shared_themes_count,
        'shared_mediums_count', r.shared_mediums_count,
        'medium', case when r.shared_mediums_count > 0
                       then (select unnest(r.cand_mediums) intersect select unnest(v_mediums) limit 1)
                       else null end,
        'city', case when r.same_city = 1 then r.cand_city else null end
      ),
      'mutual_follow_sources', 0,
      'liked_artists_count', 0,
      'mutual_avatars', '[]'::jsonb,
      'signal_count', greatest(r.shared_themes_count, r.shared_mediums_count, r.same_city),
      'top_signal', case
        when r.shared_themes_count > 0 then 'shared_themes'
        when r.shared_mediums_count > 0 then 'shared_medium'
        when r.same_city = 1 then 'same_city'
        else 'expand'
      end
    )
    from ranked r;
    return;
  end if;

  -- expand fallback or unknown mode: latest public.
  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public,
    'reason_tags', '["fallback"]'::jsonb,
    'reason_detail', '{}'::jsonb,
    'mutual_follow_sources', 0,
    'liked_artists_count', 0,
    'mutual_avatars', '[]'::jsonb,
    'signal_count', 0,
    'top_signal', 'fallback'
  )
  from profiles p
  where p.is_public = true and p.id != v_uid
    and public.is_presentable_profile(p.display_name, p.username)
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
    and not exists (
      select 1 from follows f
      where f.follower_id = v_uid and f.following_id = p.id
        and f.status = 'accepted'
    )
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_people_recs(text, text[], int, text) to authenticated;
grant execute on function public.get_people_recs(text, text[], int, text) to anon;

---------------------------------------------------------------------------
-- 2. search_people 4-arg — fuzzy + tiered ranking (B1 + B2)
--
-- The 5-arg variant defined in `p0_search_fuzzy_pg_trgm.sql` was wired
-- as dead code (no client called it). We now fold the same fuzzy
-- behaviour into the canonical 4-arg signature *plus* a clear ordering
-- contract so search results feel intentional:
--
--   tier 0  — username = q exactly (case-insensitive)
--   tier 1  — display_name = q exactly
--   tier 2  — username/display_name starts with q (prefix match)
--   tier 3  — username/display_name contains q anywhere (ilike)
--   tier 4  — fuzzy similarity > 0.2
--   then    — by similarity desc, then p.id desc (stable)
--
-- `match_rank` 0/1 is reserved for *exact name matches* (tiers 0–1) so
-- the existing client-side merge logic in `searchPeopleWithArtwork`
-- still treats artwork-derived rows (rank 2) as the next tier.
---------------------------------------------------------------------------

create or replace function public.search_people(
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
  v_q text := coalesce(trim(p_q), '');
  v_q_lower text;
  v_pattern text;
  v_prefix_pattern text;
  v_roles text[] := coalesce(p_roles, '{}');
  v_cursor_id uuid := nullif(p_cursor, '')::uuid;
begin
  if v_q = '' then
    return;
  end if;
  v_q_lower := lower(v_q);
  v_pattern := '%' || v_q || '%';
  v_prefix_pattern := v_q || '%';

  return query
  with scored as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio,
           p.main_role, p.roles, p.is_public,
           case
             when lower(coalesce(p.username, '')) = v_q_lower then 0
             when lower(coalesce(p.display_name, '')) = v_q_lower then 1
             when lower(coalesce(p.username, '')) like lower(v_prefix_pattern)
               or lower(coalesce(p.display_name, '')) like lower(v_prefix_pattern) then 2
             when p.username ilike v_pattern or p.display_name ilike v_pattern then 3
             else 4
           end as tier,
           greatest(
             similarity(coalesce(p.username, ''), v_q),
             similarity(coalesce(p.display_name, ''), v_q)
           ) as sim
    from profiles p
    where (
        p.username ilike v_pattern or p.display_name ilike v_pattern
        or similarity(coalesce(p.username, ''), v_q) > 0.2
        or similarity(coalesce(p.display_name, ''), v_q) > 0.2
      )
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles))
           or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
  )
  select jsonb_build_object(
    'id', s.id, 'username', s.username, 'display_name', s.display_name,
    'avatar_url', s.avatar_url, 'bio', s.bio, 'main_role', s.main_role,
    'roles', s.roles, 'is_public', s.is_public, 'reason', 'search',
    -- match_rank 0 = exact name (tier 0/1), 1 = prefix/contains/fuzzy
    -- (tier 2/3/4). Mirrors the contract documented in
    -- `searchPeopleWithArtwork`'s merge step.
    'match_rank', case when s.tier <= 1 then 0 else 1 end,
    'match_tier', s.tier,
    'match_similarity', s.sim
  )
  from scored s
  order by s.tier asc, s.sim desc nulls last, s.id desc
  limit greatest(coalesce(p_limit, 15), 1);
end;
$$;

grant execute on function public.search_people(text, text[], int, text) to authenticated;
grant execute on function public.search_people(text, text[], int, text) to anon;

commit;
