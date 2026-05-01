-- People tab — Subtle Quality Layer (P2)
--
-- This pass adds the *thoughtful* details: real activity signal and
-- per-user dismissal of recommendations. Each is small in surface
-- area but high in perceived care:
--
--   S2.  `profiles.last_active_at` column. Updated on certain
--        engagement-bearing actions (we do not run a giant per-RLS
--        trigger here — that's a future tune; instead we update on
--        existing high-signal events: artwork upload, follow accept,
--        artwork like). The recommendation RPC ships
--        `is_recently_active` = (last_active_at within 14 days) so
--        the client can render a small "active" dot without a
--        timestamp leak.
--
--   S3.  `people_dismissals(user_id, target_id, mode, dismissed_at)`
--        table. RPCs `people_dismiss(target_id, mode)` and
--        `people_undismiss(target_id)` flip the row, and
--        `get_people_recs` filters dismissed candidates. `mode` is
--        either `'snooze'` (default 30 days) or `'block'`
--        (permanent). The art world has sensitive interpersonal
--        dynamics; a quiet "stop showing me this person" affordance
--        is a meaningful trust gesture, much more than another
--        ranking knob.
--
--   The 4-arg `get_people_recs` is rewritten *again* (third time
--   this week) to (a) join the dismissal table, (b) pull
--   `last_active_at` and emit `is_recently_active` in every payload.
--   The header / footer of the function stay identical to P1 — only
--   the candidate filter and the SELECT list changed.
--
-- Run AFTER P0 + P1 (this migration extends `get_people_recs` and
-- requires `is_presentable_profile`).

begin;

---------------------------------------------------------------------------
-- 1. profiles.last_active_at
---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create index if not exists idx_profiles_last_active_at
  on public.profiles (last_active_at desc nulls last);

-- Backfill existing rows with their `created_at` so the recently-active
-- dot is conservative on day zero. New activity will update them.
update public.profiles
   set last_active_at = coalesce(last_active_at, created_at)
 where last_active_at is null;

-- Trigger helper: bumps a row's last_active_at to now() in a
-- side-effect-free way. We expose it as a SQL function so the
-- trigger functions below stay tiny and readable.
create or replace function public.bump_profile_last_active(p_uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_active_at = greatest(coalesce(last_active_at, '-infinity'::timestamptz), now())
   where id = p_uid;
$$;

grant execute on function public.bump_profile_last_active(uuid) to authenticated;

-- Trigger on artworks (insert / update of visibility) — uploading or
-- publishing a piece is the strongest "I am active" signal.
create or replace function public.trg_artworks_bump_artist_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.artist_id is not null then
    perform public.bump_profile_last_active(new.artist_id);
  end if;
  return new;
end;
$$;

drop trigger if exists artworks_bump_artist_active on public.artworks;
create trigger artworks_bump_artist_active
  after insert or update of visibility on public.artworks
  for each row execute function public.trg_artworks_bump_artist_active();

-- Trigger on follows (insert) — both sides count as activity.
create or replace function public.trg_follows_bump_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id is not null then
    perform public.bump_profile_last_active(new.follower_id);
  end if;
  -- The followed user gets an activity bump only when the edge is
  -- accepted (a pending request shouldn't bump the principal — they
  -- haven't even seen it yet).
  if new.status = 'accepted' and new.following_id is not null then
    perform public.bump_profile_last_active(new.following_id);
  end if;
  return new;
end;
$$;

drop trigger if exists follows_bump_active on public.follows;
create trigger follows_bump_active
  after insert on public.follows
  for each row execute function public.trg_follows_bump_active();

-- Trigger on artwork_likes (insert) — the liker counts; the liked
-- artist's activity is already covered by their upload trigger.
create or replace function public.trg_artwork_likes_bump_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    perform public.bump_profile_last_active(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists artwork_likes_bump_active on public.artwork_likes;
create trigger artwork_likes_bump_active
  after insert on public.artwork_likes
  for each row execute function public.trg_artwork_likes_bump_active();

---------------------------------------------------------------------------
-- 2. people_dismissals
---------------------------------------------------------------------------

create table if not exists public.people_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'snooze' check (mode in ('snooze', 'block')),
  dismissed_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, target_id)
);

create index if not exists idx_people_dismissals_user
  on public.people_dismissals (user_id, expires_at);

alter table public.people_dismissals enable row level security;

drop policy if exists people_dismissals_self_select on public.people_dismissals;
create policy people_dismissals_self_select on public.people_dismissals
  for select to authenticated
  using (user_id = auth.uid());

-- All mutations go through SECURITY DEFINER RPCs below; we don't grant
-- direct INSERT/UPDATE/DELETE.

---------------------------------------------------------------------------
-- 3. RPC: people_dismiss / people_undismiss
---------------------------------------------------------------------------

create or replace function public.people_dismiss(
  p_target uuid,
  p_mode text default 'snooze'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := lower(coalesce(trim(p_mode), 'snooze'));
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_target is null or p_target = v_uid then
    raise exception 'invalid target';
  end if;
  if v_mode not in ('snooze', 'block') then v_mode := 'snooze'; end if;

  -- snooze = 30 days; block = no expiry.
  v_expires := case when v_mode = 'snooze' then now() + interval '30 days' else null end;

  insert into public.people_dismissals (user_id, target_id, mode, dismissed_at, expires_at)
  values (v_uid, p_target, v_mode, now(), v_expires)
  on conflict (user_id, target_id) do update
    set mode = excluded.mode,
        dismissed_at = now(),
        expires_at = excluded.expires_at;

  return true;
end;
$$;

grant execute on function public.people_dismiss(uuid, text) to authenticated;

create or replace function public.people_undismiss(p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_target is null then raise exception 'invalid target'; end if;

  delete from public.people_dismissals
   where user_id = v_uid and target_id = p_target;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.people_undismiss(uuid) to authenticated;

---------------------------------------------------------------------------
-- 4. get_people_recs — joins dismissals + emits is_recently_active
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
  v_active_threshold timestamptz := now() - interval '14 days';
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
  -- Guests get is_recently_active so the dot still appears for them.
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
      'top_signal', 'fallback',
      'is_recently_active', (p.last_active_at is not null and p.last_active_at > v_active_threshold)
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

  -- Pull viewer-context fields once for expand-signal scoring.
  select coalesce(p.themes, '{}'::text[]),
         coalesce(p.mediums, '{}'::text[]),
         coalesce(nullif(trim(p.location), ''), null)
    into v_themes, v_mediums, v_city
    from profiles p where p.id = v_uid;
  v_themes := coalesce(v_themes, '{}'::text[]);
  v_mediums := coalesce(v_mediums, '{}'::text[]);

  -------------------------------------------------------------------------
  -- follow_graph
  -------------------------------------------------------------------------
  if v_mode = 'follow_graph' then
    return query
    with two_hop as (
      select f2.following_id as candidate_id,
        count(distinct f2.follower_id)::int as mutual_sources,
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
        and f2.following_id not in (
          select target_id from public.people_dismissals
          where user_id = v_uid and (expires_at is null or expires_at > now())
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
      'top_signal', 'follow_graph',
      'is_recently_active', (p.last_active_at is not null and p.last_active_at > v_active_threshold)
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
  -- likes_based
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
        p.main_role, p.roles, p.is_public, p.last_active_at, c.liked_cnt
      from (
        select la.artist_id as candidate_id, la.cnt as liked_cnt
        from liked_artists la
        where la.artist_id != v_uid
          and la.artist_id not in (
            select following_id from follows
            where follower_id = v_uid and status = 'accepted'
          )
          and la.artist_id not in (
            select target_id from public.people_dismissals
            where user_id = v_uid and (expires_at is null or expires_at > now())
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
      select p.id, p.username, p.display_name, p.avatar_url, p.bio,
        p.main_role, p.roles, p.is_public, p.last_active_at, 0::int as liked_cnt
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
        and p.id not in (
          select target_id from public.people_dismissals
          where user_id = v_uid and (expires_at is null or expires_at > now())
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
      'top_signal', case when r.liked_cnt > 0 then 'likes_based' else 'fallback' end,
      'is_recently_active', (r.last_active_at is not null and r.last_active_at > v_active_threshold)
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
  -- expand
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
        p.main_role, p.roles, p.is_public, p.last_active_at,
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
        and p.id not in (
          select target_id from public.people_dismissals
          where user_id = v_uid and (expires_at is null or expires_at > now())
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
      end,
      'is_recently_active', (r.last_active_at is not null and r.last_active_at > v_active_threshold)
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
    'top_signal', 'fallback',
    'is_recently_active', (p.last_active_at is not null and p.last_active_at > v_active_threshold)
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
    and p.id not in (
      select target_id from public.people_dismissals
      where user_id = v_uid and (expires_at is null or expires_at > now())
    )
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_people_recs(text, text[], int, text) to authenticated;
grant execute on function public.get_people_recs(text, text[], int, text) to anon;

commit;
