-- Private Account v2 — Phase 2 (PR2): content SELECT gating
--
-- This migration finishes the "보호 계정" model started in
-- 20260511000000_private_account_searchable_and_follow_requests.sql.
--
-- Phase 1 made private profiles searchable and exposed a meta-card slice
-- so visitors can send a follow request. The actual content (artworks,
-- exhibitions, exhibition works/media) was left wide open in that PR
-- specifically to keep the diff narrow and the regression surface
-- inspectable. This PR finishes the work:
--
--   • visibility = 'public' artworks of a *private* artist are now visible
--     only to the artist, their account-scope delegate, accepted
--     followers, or anyone with a confirmed claim on the work.
--   • exhibitions (`projects` rows where `project_type = 'exhibition'`)
--     follow the same rule via their host_profile_id / curator_id.
--   • exhibition_works / exhibition_media / exhibition_media_buckets
--     piggyback on the project gate by replacing their `using (true)`
--     SELECT policy with an EXISTS check against the parent project.
--
-- IMPORTANT non-changes:
--   • Public-account content is unaffected (the new EXISTS resolves to
--     true via `is_public = true`, so the OR-combined RLS evaluates the
--     same as before).
--   • Owner / delegate / claim-holder visibility stays intact thanks to
--     the existing `artworks_select_own`, `artworks_select_with_claim`,
--     `artworks_select_account_delegate`, `projects_*_account_delegate`,
--     and `projects_update_curator_or_delegate` policies.
--   • External artists (`artist_id IS NULL`) are still publicly visible —
--     they do not have a private flag to gate on.
--   • Shortlists / boards keep their own visibility semantics; they are
--     intentionally NOT folded into the private-account gate because they
--     have an explicit `is_public` toggle of their own and Phase 2 is
--     scoped to first-class artist content (works + exhibitions).

begin;

---------------------------------------------------------------------------
-- 1. artworks SELECT — gate `visibility = 'public'` rows when the artist
--    is private. Owners / delegates / claimants pass through unchanged
--    via their dedicated policies.
---------------------------------------------------------------------------

drop policy if exists artworks_select_public on public.artworks;
create policy artworks_select_public on public.artworks
  for select to public
  using (
    visibility = 'public'
    and (
      artist_id is null
      or exists (
        select 1
        from public.profiles p
        where p.id = artworks.artist_id
          and coalesce(p.is_public, true) = true
      )
    )
  );

drop policy if exists artworks_select_follower_accepted on public.artworks;
create policy artworks_select_follower_accepted on public.artworks
  for select to authenticated
  using (
    visibility = 'public'
    and artist_id is not null
    and exists (
      select 1
      from public.follows f
      where f.following_id = artworks.artist_id
        and f.follower_id = auth.uid()
        and f.status = 'accepted'
    )
  );

---------------------------------------------------------------------------
-- 2. projects SELECT — same idea, but a project has *two* potentially
--    private parties (host_profile_id and curator_id). To keep the
--    rule simple and conservative, a project is publicly listed only
--    when *both* identified parties are public (NULL counts as "no
--    party", which we treat as public for compatibility with legacy
--    rows). Accepted followers of either party can see it. Owners
--    / curators / delegates still pass via their own policies.
---------------------------------------------------------------------------

drop policy if exists projects_select_public on public.projects;
create policy projects_select_public on public.projects
  for select to public
  using (
    (
      host_profile_id is null
      or exists (
        select 1
        from public.profiles p
        where p.id = projects.host_profile_id
          and coalesce(p.is_public, true) = true
      )
    )
    and (
      curator_id is null
      or exists (
        select 1
        from public.profiles p
        where p.id = projects.curator_id
          and coalesce(p.is_public, true) = true
      )
    )
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
    exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.status = 'accepted'
        and (
          f.following_id = projects.host_profile_id
          or f.following_id = projects.curator_id
        )
    )
  );

---------------------------------------------------------------------------
-- 3. exhibition_works / exhibition_media / exhibition_media_buckets —
--    replace the `using (true)` SELECT with an EXISTS check against the
--    parent project. Because PostgreSQL evaluates RLS recursively, the
--    EXISTS subquery itself respects the projects RLS policies above,
--    so the child rows are gated automatically.
--
--    Account-scope delegate / curator policies for INSERT / UPDATE /
--    DELETE on these tables are untouched; only SELECT is tightened.
---------------------------------------------------------------------------

---------------------------------------------------------------------------
-- 3a. artwork_images SELECT — drop the legacy `a.visibility = 'public'`
--     policy and replace it with a parent-table EXISTS that respects
--     `artworks` RLS. Without this change, visitors who happen to learn
--     a private artist's image row id could read the image record (and
--     therefore the storage path) even though the artwork itself is now
--     gated.
---------------------------------------------------------------------------

drop policy if exists "Allow public select artwork_images" on public.artwork_images;
create policy "Allow public select artwork_images"
  on public.artwork_images for select
  to public
  using (
    exists (
      select 1
      from public.artworks a
      where a.id = artwork_images.artwork_id
    )
  );

---------------------------------------------------------------------------
-- 3b. exhibition_works / exhibition_media / exhibition_media_buckets
---------------------------------------------------------------------------

drop policy if exists exhibition_works_select on public.exhibition_works;
create policy exhibition_works_select on public.exhibition_works
  for select to public
  using (
    exists (
      select 1
      from public.projects p
      where p.id = exhibition_works.exhibition_id
    )
  );

drop policy if exists exhibition_media_select on public.exhibition_media;
create policy exhibition_media_select on public.exhibition_media
  for select to public
  using (
    exists (
      select 1
      from public.projects p
      where p.id = exhibition_media.exhibition_id
    )
  );

drop policy if exists exhibition_media_buckets_select on public.exhibition_media_buckets;
create policy exhibition_media_buckets_select on public.exhibition_media_buckets
  for select to public
  using (
    exists (
      select 1
      from public.projects p
      where p.id = exhibition_media_buckets.exhibition_id
    )
  );

commit;
