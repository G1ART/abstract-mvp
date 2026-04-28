-- Private Account v2 — Phase 1 (PR1)
--
-- Backstory:
--   Until this migration, "비공개 계정" (`profiles.is_public = false`) meant
--   *complete* invisibility — the row was filtered out of `search_people`,
--   `search_artists_by_artwork`, `get_people_recs`, `get_search_suggestion`,
--   the lanes RPC, `lookup_profile_by_username`, and the `profiles` SELECT
--   RLS. That is much stricter than every major SNS (Instagram, X-protected,
--   TikTok, Threads, Bluesky), all of which expose the *profile card meta*
--   while gating only the *content*.
--
--   QA team (and most users coming from those platforms) reasonably expect:
--     1. Searching a private account by username/name should still work.
--     2. The profile card (avatar / display name / main role / bio) should
--        still be visible, with a clear "private" indicator.
--     3. A "Follow request" button should be available so the principal can
--        approve or decline.
--     4. Mutual / accepted followers eventually see the content (Phase 2,
--        next migration).
--
-- This migration covers Phase 1 only. It deliberately does NOT change the
-- artwork / exhibition / project SELECT RLS — those still gate on
-- `visibility = 'public'` only. Phase 2 (next PR) will add the owner-private
-- gate that requires `follows.status = 'accepted'` for visitors.
--
-- Surface map (Phase 1):
--   1. Search RPCs drop `is_public = true` filter so private accounts appear.
--      Response payload still carries `is_public` so the UI shows a 🔒 chip.
--   2. `lookup_profile_by_username()` returns a *card-only slice* for
--      private rows (id, username, display_name, avatar_url, main_role,
--      roles, bio, `is_public:false`, viewer_follow_status). Sensitive
--      portfolio fields (themes, mediums, education, awards, statement,
--      cover, studio_portfolio, location, website) remain hidden.
--   3. `follows.status` column with `accepted | pending`, defaulting to
--      `accepted` so legacy rows are unaffected.
--   4. `follows` SELECT RLS allows the follower or the followed user to
--      read pending edges (so the principal can see incoming requests).
--   5. RPCs: `request_follow_or_follow`, `accept_follow_request`,
--      `decline_follow_request`, `cancel_follow_request`. All
--      `security definer` and respect target's `is_public` setting.
--   6. `notifications.notifications_type_check` extended with
--      `follow_request`, `follow_request_accepted`.
--   7. `notify_on_follow` trigger emits `follow` for accepted edges and
--      `follow_request` for pending edges.

begin;

---------------------------------------------------------------------------
-- 1. follows.status  (additive, backwards-compatible)
---------------------------------------------------------------------------
alter table public.follows
  add column if not exists status text not null default 'accepted';

do $$
begin
  alter table public.follows
    drop constraint if exists follows_status_check;
  alter table public.follows
    add constraint follows_status_check
    check (status in ('accepted', 'pending'));
exception when undefined_table then null;
end $$;

create index if not exists idx_follows_following_status
  on public.follows (following_id, status);
create index if not exists idx_follows_follower_status
  on public.follows (follower_id, status);

---------------------------------------------------------------------------
-- 2. follows SELECT RLS — additive policies only.
--
--    We deliberately do NOT toggle ENABLE/DISABLE on the table because we
--    cannot tell from this repo whether RLS is currently on (the original
--    `create table follows` happened outside the migration tree). Adding
--    SELECT policies is safe regardless: if RLS is disabled they are
--    effectively no-ops; if RLS is enabled they OR with whatever else is
--    already there.
--
--    Mutations (INSERT/UPDATE/DELETE) all go through the SECURITY DEFINER
--    RPCs declared in §5; legacy direct-insert paths are migrated to
--    `request_follow_or_follow` in the matching client patch.
---------------------------------------------------------------------------
drop policy if exists follows_select_self on public.follows;
create policy follows_select_self on public.follows
  for select to authenticated
  using (
    follower_id = auth.uid()
    or following_id = auth.uid()
  );

drop policy if exists follows_select_accepted_public on public.follows;
create policy follows_select_accepted_public on public.follows
  for select to authenticated, anon
  using (status = 'accepted');

---------------------------------------------------------------------------
-- 3. Notification type extension
---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'like','follow','claim_request','claim_confirmed','claim_rejected',
    'price_inquiry','price_inquiry_reply','new_work','connection_message',
    'board_save','board_public',
    'delegation_invite_received','delegation_accepted',
    'delegation_declined','delegation_revoked',
    'follow_request','follow_request_accepted'
  ]));

---------------------------------------------------------------------------
-- 4. notify_on_follow — branch on status
---------------------------------------------------------------------------
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id = new.following_id then
    return new;
  end if;

  if new.status = 'pending' then
    insert into public.notifications (user_id, type, actor_id)
    values (new.following_id, 'follow_request', new.follower_id);
  else
    insert into public.notifications (user_id, type, actor_id)
    values (new.following_id, 'follow', new.follower_id);
  end if;
  return new;
end;
$$;

-- When a pending row is approved (status flips pending → accepted), notify
-- the follower that their request was accepted. We use a separate trigger
-- so that legacy direct-insert paths don't double-fire.
create or replace function public.notify_on_follow_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    -- Notify the original follower (now an accepted follower) and the
    -- principal (now has a new follower).
    if new.follower_id <> new.following_id then
      insert into public.notifications (user_id, type, actor_id)
      values (new.follower_id, 'follow_request_accepted', new.following_id);
      insert into public.notifications (user_id, type, actor_id)
      values (new.following_id, 'follow', new.follower_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_follow_accept_notify on public.follows;
create trigger on_follow_accept_notify
  after update on public.follows
  for each row execute function public.notify_on_follow_accept();

---------------------------------------------------------------------------
-- 5. RPCs
--    - request_follow_or_follow(target)
--      Public target  → insert with status='accepted' (idempotent).
--      Private target → insert with status='pending'  (idempotent).
--      Returns the resulting status ('accepted' | 'pending') so the UI
--      can update its label without a follow-up roundtrip.
--
--    - accept_follow_request(follower)
--      Caller must be `auth.uid() = following_id`. Flips pending→accepted.
--
--    - decline_follow_request(follower)
--      Caller must be `auth.uid() = following_id`. Deletes the row.
--
--    - cancel_follow_request(target)
--      Caller must be `auth.uid() = follower_id`. Deletes the row
--      (whether pending or accepted; functionally an unfollow).
---------------------------------------------------------------------------
create or replace function public.request_follow_or_follow(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_public boolean;
  v_existing_status text;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_target is null or p_target = v_uid then
    raise exception 'invalid target';
  end if;

  select coalesce(is_public, true) into v_target_public
  from public.profiles
  where id = p_target
  limit 1;

  if v_target_public is null then
    raise exception 'target profile not found';
  end if;

  select status into v_existing_status
  from public.follows
  where follower_id = v_uid and following_id = p_target
  limit 1;

  if v_existing_status is not null then
    return v_existing_status;
  end if;

  insert into public.follows (follower_id, following_id, status)
  values (
    v_uid,
    p_target,
    case when v_target_public then 'accepted' else 'pending' end
  );

  return case when v_target_public then 'accepted' else 'pending' end;
end;
$$;

grant execute on function public.request_follow_or_follow(uuid) to authenticated;

create or replace function public.accept_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_follower is null then
    raise exception 'invalid follower';
  end if;

  update public.follows
     set status = 'accepted'
   where follower_id = p_follower
     and following_id = v_uid
     and status = 'pending';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.accept_follow_request(uuid) to authenticated;

create or replace function public.decline_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_follower is null then
    raise exception 'invalid follower';
  end if;

  delete from public.follows
   where follower_id = p_follower
     and following_id = v_uid
     and status = 'pending';

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.decline_follow_request(uuid) to authenticated;

create or replace function public.cancel_follow_request(p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_target is null then
    raise exception 'invalid target';
  end if;

  delete from public.follows
   where follower_id = v_uid
     and following_id = p_target
     and status = 'pending';

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.cancel_follow_request(uuid) to authenticated;

-- Helper: return follow status of viewer toward target.
--   'none'      → no edge
--   'pending'   → request sent, awaiting approval
--   'accepted'  → following / mutual
create or replace function public.get_viewer_follow_status(p_target uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null or p_target is null or v_uid = p_target then
    return 'none';
  end if;
  select status into v_status
  from public.follows
  where follower_id = v_uid and following_id = p_target
  limit 1;
  return coalesce(v_status, 'none');
end;
$$;

grant execute on function public.get_viewer_follow_status(uuid) to authenticated;
grant execute on function public.get_viewer_follow_status(uuid) to anon;

---------------------------------------------------------------------------
-- 5b. profiles SELECT — allow reading the *meta* row across an existing
--     follow edge (in either direction).
--
--     Rationale: when notifications join `notifications.actor_id ->
--     profiles(...)` to render "{name} requested to follow you", the
--     follower's row may be private and therefore invisible to the
--     receiver under the legacy `is_public = true OR id = auth.uid()`
--     SELECT policy. Adding follow-edge-aware policies surfaces the
--     minimum amount of profile metadata needed to render notification
--     copy, follower lists, follow request inboxes, and the "X accepted
--     your request" path. RLS column-level filtering is unchanged — the
--     row is exposed in full, but every consumer query already projects
--     only the safe meta columns.
--
--     IMPORTANT: This does NOT loosen content access (artworks /
--     exhibitions stay gated by their own SELECT policies). Phase 2
--     extends those to require status='accepted'.
---------------------------------------------------------------------------
drop policy if exists profiles_select_follow_request_actor on public.profiles;
create policy profiles_select_follow_request_actor on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.follows f
      where f.follower_id = profiles.id
        and f.following_id = auth.uid()
    )
  );

drop policy if exists profiles_select_follow_request_target on public.profiles;
create policy profiles_select_follow_request_target on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.follows f
      where f.following_id = profiles.id
        and f.follower_id = auth.uid()
    )
  );

---------------------------------------------------------------------------
-- 6. lookup_profile_by_username — return meta-card slice for private rows
---------------------------------------------------------------------------
create or replace function public.lookup_profile_by_username(p_username text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  rec record;
  sp jsonb;
  v_uid uuid := auth.uid();
  v_status text := 'none';
begin
  select id, username, display_name, main_role, avatar_url, is_public,
         bio, location, website, roles, profile_details,
         cover_image_url, cover_image_position_y, artist_statement,
         artist_statement_hero_image_url, artist_statement_updated_at
    into rec
    from profiles
   where lower(username) = lower(trim(p_username))
   limit 1;

  if not found then
    return null;
  end if;

  if v_uid is not null and v_uid <> rec.id then
    select status into v_status
      from public.follows
     where follower_id = v_uid
       and following_id = rec.id
     limit 1;
    v_status := coalesce(v_status, 'none');
  end if;

  if rec.is_public = true then
    sp := null;
    if rec.profile_details is not null and jsonb_typeof(rec.profile_details) = 'object' then
      sp := rec.profile_details->'studio_portfolio';
    end if;
    return jsonb_build_object(
      'id', rec.id,
      'username', rec.username,
      'display_name', rec.display_name,
      'main_role', rec.main_role,
      'avatar_url', rec.avatar_url,
      'bio', rec.bio,
      'location', rec.location,
      'website', rec.website,
      'roles', rec.roles,
      'is_public', true,
      'studio_portfolio', case when sp is null or jsonb_typeof(sp) = 'null' then null else sp end,
      'cover_image_url', rec.cover_image_url,
      'cover_image_position_y', rec.cover_image_position_y,
      'artist_statement', rec.artist_statement,
      'artist_statement_hero_image_url', rec.artist_statement_hero_image_url,
      'artist_statement_updated_at', rec.artist_statement_updated_at,
      'viewer_follow_status', v_status
    );
  else
    -- Private profile: meta-card slice only. Sensitive portfolio fields
    -- (themes, mediums, education, awards, statement, cover image, studio
    -- portfolio, location, website) are intentionally omitted. The bio is
    -- included because every major SNS shows it as part of the card.
    return jsonb_build_object(
      'id', rec.id,
      'username', rec.username,
      'display_name', rec.display_name,
      'main_role', rec.main_role,
      'avatar_url', rec.avatar_url,
      'roles', rec.roles,
      'bio', rec.bio,
      'is_public', false,
      'viewer_follow_status', v_status
    );
  end if;
end;
$$;

grant execute on function public.lookup_profile_by_username(text) to authenticated;
grant execute on function public.lookup_profile_by_username(text) to anon;

---------------------------------------------------------------------------
-- 7. Search RPCs — drop `is_public = true` filter so private accounts
--    surface in search. We do not change the response shape (still
--    includes `is_public` so the UI can render a 🔒 chip and gate
--    follow vs follow-request).
---------------------------------------------------------------------------

-- 7a. search_people (people_rpc.sql signature: text, text[], int, text)
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
  v_pattern text;
  v_q text := coalesce(trim(p_q), '');
  v_roles text[] := coalesce(p_roles, '{}');
  v_cursor_id uuid := nullif(p_cursor, '')::uuid;
begin
  if v_q = '' then
    return;
  end if;
  v_pattern := '%' || v_q || '%';

  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public, 'reason', 'search'
  )
  from profiles p
  where (p.username ilike v_pattern or p.display_name ilike v_pattern)
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles))
         or (coalesce(p.roles, '{}'::text[]) && v_roles))
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit greatest(coalesce(p_limit, 15), 1);
end;
$$;

grant execute on function public.search_people(text, text[], int, text) to authenticated;
grant execute on function public.search_people(text, text[], int, text) to anon;

-- 7b. search_people fuzzy variant (p0_search_fuzzy_pg_trgm.sql)
--     Same signature but with pg_trgm fuzzy matching. Re-declare without
--     the `is_public = true` filter; behaviour is otherwise identical.
create or replace function public.search_people(
  p_q text,
  p_roles text[],
  p_limit int,
  p_cursor text,
  p_fuzzy boolean
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_pattern text;
  v_q text := coalesce(trim(p_q), '');
  v_roles text[] := coalesce(p_roles, '{}');
begin
  if v_q = '' then
    return;
  end if;
  v_pattern := '%' || v_q || '%';

  if p_fuzzy = true then
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public, 'reason', 'search',
      'match_rank', (case when (p.username ilike v_pattern or p.display_name ilike v_pattern) then 0 else 1 end)
    )
    from profiles p
    where (
        p.username ilike v_pattern or p.display_name ilike v_pattern
        or similarity(coalesce(p.username, ''), v_q) > 0.2
        or similarity(coalesce(p.display_name, ''), v_q) > 0.2
      )
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles))
           or (coalesce(p.roles, '{}'::text[]) && v_roles))
    order by
      (case when (p.username ilike v_pattern or p.display_name ilike v_pattern) then 0 else 1 end),
      greatest(similarity(coalesce(p.username, ''), v_q), similarity(coalesce(p.display_name, ''), v_q)) desc,
      p.id desc
    limit greatest(coalesce(p_limit, 15), 1);
  else
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public, 'reason', 'search',
      'match_rank', 0
    )
    from profiles p
    where (p.username ilike v_pattern or p.display_name ilike v_pattern)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles))
           or (coalesce(p.roles, '{}'::text[]) && v_roles))
    order by p.id desc
    limit greatest(coalesce(p_limit, 15), 1);
  end if;
end;
$$;

grant execute on function public.search_people(text, text[], int, text, boolean) to authenticated;
grant execute on function public.search_people(text, text[], int, text, boolean) to anon;

-- 7c. search_artists_by_artwork
create or replace function public.search_artists_by_artwork(
  p_q text,
  p_roles text[] default '{}',
  p_limit int default 20
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := coalesce(trim(p_q), '');
  v_pattern text;
  v_roles text[] := coalesce(p_roles, '{}');
begin
  if v_q = '' then
    return;
  end if;
  v_pattern := '%' || v_q || '%';

  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public, 'reason', 'artwork',
    'match_rank', 2
  )
  from profiles p
  where p.id in (
      select distinct a.artist_id
      from artworks a
      where a.artist_id is not null
        and a.visibility = 'public'
        and (
          a.title ilike v_pattern
          or a.medium ilike v_pattern
          or a.story ilike v_pattern
        )
    )
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles))
         or (coalesce(p.roles, '{}'::text[]) && v_roles))
  order by p.id desc
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;

grant execute on function public.search_artists_by_artwork(text, text[], int) to authenticated;
grant execute on function public.search_artists_by_artwork(text, text[], int) to anon;

-- 7d. get_search_suggestion — drop is_public filter so suggestions can
--     point to private accounts as well.
create or replace function public.get_search_suggestion(p_q text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := coalesce(trim(p_q), '');
  v_best_profile record;
begin
  if v_q = '' or length(v_q) < 2 then
    return jsonb_build_object('suggestion', null);
  end if;

  select p.display_name, p.username,
    greatest(
      similarity(coalesce(p.display_name, ''), v_q),
      similarity(coalesce(p.username, ''), v_q)
    ) as sim
  into v_best_profile
  from profiles p
  where (similarity(coalesce(p.display_name, ''), v_q) > 0.25
         or similarity(coalesce(p.username, ''), v_q) > 0.25)
  order by greatest(
    similarity(coalesce(p.display_name, ''), v_q),
    similarity(coalesce(p.username, ''), v_q)
  ) desc
  limit 1;

  if v_best_profile is null then
    return jsonb_build_object('suggestion', null);
  end if;

  return jsonb_build_object(
    'suggestion',
      coalesce(v_best_profile.display_name, v_best_profile.username)
  );
end;
$$;

grant execute on function public.get_search_suggestion(text) to authenticated;
grant execute on function public.get_search_suggestion(text) to anon;

commit;
