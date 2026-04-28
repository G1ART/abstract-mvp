-- Private Account v2 — signup hotfix
--
-- Symptom:
--   New-user signup started failing with "Database error saving new user"
--   after the PR1+PR2 migrations
--   (20260511000000_private_account_searchable_and_follow_requests.sql,
--    20260512000000_private_account_content_rls.sql) were applied.
--
-- Root cause analysis:
--   The signup trigger `on_auth_user_created_link_external_artist`
--   (defined in p0_auth_link_external_artist_on_signup.sql) updates
--   `public.artworks` (`set artist_id = v_user_id where id = any(...)`)
--   on behalf of a freshly-created user. Even though the trigger is
--   SECURITY DEFINER, RLS policy USING clauses are still evaluated at
--   the *current row* level. Our PR2 policies introduced inline
--   `EXISTS (select 1 from public.profiles ...)` and
--   `EXISTS (select 1 from public.follows ...)` subqueries inside the
--   `artworks_select_public` / `projects_select_*` policies. Those
--   subqueries are themselves subject to RLS evaluation (they are *not*
--   automatically privileged just because the outer call sits inside a
--   SECURITY DEFINER trigger), and combine awkwardly with the
--   PR1 follow-edge-aware policies on `profiles`. The result is an
--   evaluation path that can fail (or recurse) inside the gotrue signup
--   transaction, surfacing as the generic "Database error saving new
--   user" message from Auth.
--
-- Fix:
--   Extract the visibility / follower checks into SECURITY DEFINER
--   STABLE helper functions. SECURITY DEFINER functions execute with
--   the privileges of the function owner (a supabase admin role with
--   BYPASSRLS), which means the helper bodies are *not* re-evaluated
--   under RLS. The policies then reduce to a single boolean function
--   call and can no longer cycle back through profiles/follows RLS
--   during a signup-time trigger.
--
--   Functional behavior is preserved exactly — every existing rule
--   (public artist visibility, accepted-follower exception, owner
--   passthrough, NULL artist_id passthrough, mutual follow-edge meta
--   exposure) stays identical. The only change is *how* those rules
--   are computed.
--
-- Safe to re-run: every helper is `create or replace`, every policy
-- redefinition is `drop policy if exists` + `create policy`.

begin;

---------------------------------------------------------------------------
-- 1. SECURITY DEFINER helpers
---------------------------------------------------------------------------

-- Returns TRUE when the artist (or curator/host) profile is public, NULL
-- when the row does not exist (treated as "public" for legacy rows),
-- FALSE only when the profile exists and is_public = false.
create or replace function public.is_artist_publicly_visible(p_artist_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select coalesce(is_public, true)
       from public.profiles
      where id = p_artist_id
      limit 1),
    true
  );
$$;

revoke all on function public.is_artist_publicly_visible(uuid) from public;
grant execute on function public.is_artist_publicly_visible(uuid)
  to authenticated, anon;

-- Returns TRUE when the calling user is an `accepted` follower of the
-- target. Returns FALSE for unauthenticated callers, self-references,
-- pending requests, or missing edges.
create or replace function public.viewer_is_accepted_follower_of(p_target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or p_target is null or auth.uid() = p_target
      then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = p_target
        and f.status = 'accepted'
    )
  end;
$$;

revoke all on function public.viewer_is_accepted_follower_of(uuid) from public;
grant execute on function public.viewer_is_accepted_follower_of(uuid)
  to authenticated;

-- Returns TRUE when the calling user has *any* follow edge (pending or
-- accepted, in either direction) with the given profile. Used so the
-- notifications inbox can resolve the meta-card of a private follower /
-- target without exposing content RLS.
create or replace function public.viewer_shares_follow_edge_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when auth.uid() is null or p_other is null or auth.uid() = p_other
      then false
    else exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.following_id = p_other)
         or (f.following_id = auth.uid() and f.follower_id = p_other)
    )
  end;
$$;

revoke all on function public.viewer_shares_follow_edge_with(uuid) from public;
grant execute on function public.viewer_shares_follow_edge_with(uuid)
  to authenticated;

---------------------------------------------------------------------------
-- 2. profiles — fold the two PR1 follow-edge-aware policies into one
--    helper-driven policy. Net effect (RLS-bypassed boolean) is identical
--    to the OR of the two original USING clauses.
---------------------------------------------------------------------------

drop policy if exists profiles_select_follow_request_actor on public.profiles;
drop policy if exists profiles_select_follow_request_target on public.profiles;
drop policy if exists profiles_select_follow_edge on public.profiles;

create policy profiles_select_follow_edge on public.profiles
  for select to authenticated
  using (public.viewer_shares_follow_edge_with(profiles.id));

---------------------------------------------------------------------------
-- 3. artworks — restate PR2 SELECT policies via helpers.
---------------------------------------------------------------------------

drop policy if exists artworks_select_public on public.artworks;
create policy artworks_select_public on public.artworks
  for select to public
  using (
    visibility = 'public'
    and (
      artist_id is null
      or public.is_artist_publicly_visible(artist_id)
    )
  );

drop policy if exists artworks_select_follower_accepted on public.artworks;
create policy artworks_select_follower_accepted on public.artworks
  for select to authenticated
  using (
    visibility = 'public'
    and artist_id is not null
    and public.viewer_is_accepted_follower_of(artist_id)
  );

---------------------------------------------------------------------------
-- 4. projects — same helper substitution.
---------------------------------------------------------------------------

drop policy if exists projects_select_public on public.projects;
create policy projects_select_public on public.projects
  for select to public
  using (
    (host_profile_id is null
       or public.is_artist_publicly_visible(host_profile_id))
    and
    (curator_id is null
       or public.is_artist_publicly_visible(curator_id))
  );

drop policy if exists projects_select_owner on public.projects;
create policy projects_select_owner on public.projects
  for select to authenticated
  using (
    (host_profile_id is not null and host_profile_id = auth.uid())
    or (curator_id is not null and curator_id = auth.uid())
  );

drop policy if exists projects_select_follower_accepted on public.projects;
create policy projects_select_follower_accepted on public.projects
  for select to authenticated
  using (
    (host_profile_id is not null
       and public.viewer_is_accepted_follower_of(host_profile_id))
    or (curator_id is not null
       and public.viewer_is_accepted_follower_of(curator_id))
  );

---------------------------------------------------------------------------
-- 5. exhibition_works / exhibition_media / exhibition_media_buckets —
--    the inline EXISTS against `projects` here is safe because the
--    parent `projects` policies are now helper-driven. We restate them
--    for explicitness so the migration is self-contained, and so a
--    subsequent rerun cleanly converges to the final state.
---------------------------------------------------------------------------

drop policy if exists exhibition_works_select on public.exhibition_works;
create policy exhibition_works_select on public.exhibition_works
  for select to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_works.exhibition_id
    )
  );

drop policy if exists exhibition_media_select on public.exhibition_media;
create policy exhibition_media_select on public.exhibition_media
  for select to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_media.exhibition_id
    )
  );

drop policy if exists exhibition_media_buckets_select on public.exhibition_media_buckets;
create policy exhibition_media_buckets_select on public.exhibition_media_buckets
  for select to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_media_buckets.exhibition_id
    )
  );

commit;
