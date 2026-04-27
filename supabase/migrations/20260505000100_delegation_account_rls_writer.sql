-- Delegation Final Hardening — PR-A · account-scope WRITE policies become
-- permission-aware. SELECT policies remain unchanged: even `account_review`
-- delegates need read access (their entire purpose is to view & advise).
--
-- Mapping (account preset permission tokens → tables / actions):
--   manage_artworks  → artworks INSERT/UPDATE/DELETE,
--                      artwork_images INSERT/UPDATE/DELETE
--   manage_works     → projects INSERT/UPDATE/DELETE  (delegator is curator OR host)
--                      exhibition_works INSERT/UPDATE/DELETE
--   edit_metadata    → projects INSERT/UPDATE/DELETE  (alternate path)
--                      [edit_metadata covers the lighter "exhibition copy" use-case]
--   manage_claims    → claims UPDATE/DELETE (status='pending' guard preserved)
--   manage_inquiries → price_inquiries reply path (via can_reply_to_price_inquiry)
--   view             → no write.
--
-- Notes on regression safety:
--   * Policy NAMES are preserved verbatim (drop+recreate). Application code
--     never references policies by name, but other migrations may, so keep
--     them stable.
--   * Owner-side policies (`*_owner`, `*_owner_*`) and project-scope-delegate
--     policies are NOT touched here.
--   * SELECT policies (`artworks_select_account_delegate`, etc.) are NOT
--     touched. Read-only review is an explicit feature.
--   * Helpers used: `is_active_account_delegate_writer(owner)`,
--     `has_active_account_delegate_perm(owner, perm)` — both anchor on
--     auth.uid() and only match status='active' rows, so revoking a
--     delegation immediately revokes write capability.

begin;

-- ───────────────────────── artworks ─────────────────────────
drop policy if exists artworks_update_account_delegate on public.artworks;
create policy artworks_update_account_delegate on public.artworks
  for update to authenticated
  using (public.has_active_account_delegate_perm(artist_id, 'manage_artworks'))
  with check (public.has_active_account_delegate_perm(artist_id, 'manage_artworks'));

drop policy if exists artworks_delete_account_delegate on public.artworks;
create policy artworks_delete_account_delegate on public.artworks
  for delete to authenticated
  using (public.has_active_account_delegate_perm(artist_id, 'manage_artworks'));

drop policy if exists artworks_insert_account_delegate on public.artworks;
create policy artworks_insert_account_delegate on public.artworks
  for insert to authenticated
  with check (
    artist_id is not null
    and public.has_active_account_delegate_perm(artist_id, 'manage_artworks')
  );

-- ───────────────────────── artwork_images ───────────────────
drop policy if exists artwork_images_insert_account_delegate on public.artwork_images;
create policy artwork_images_insert_account_delegate on public.artwork_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.has_active_account_delegate_perm(a.artist_id, 'manage_artworks')
    )
  );

drop policy if exists artwork_images_update_account_delegate on public.artwork_images;
create policy artwork_images_update_account_delegate on public.artwork_images
  for update to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.has_active_account_delegate_perm(a.artist_id, 'manage_artworks')
    )
  )
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.has_active_account_delegate_perm(a.artist_id, 'manage_artworks')
    )
  );

drop policy if exists artwork_images_delete_account_delegate on public.artwork_images;
create policy artwork_images_delete_account_delegate on public.artwork_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.has_active_account_delegate_perm(a.artist_id, 'manage_artworks')
    )
  );

-- ───────────────────────── projects ─────────────────────────
-- For projects we accept either `manage_works` (the canonical works-mgmt
-- token also used by exhibition_works) OR `edit_metadata` (lighter copy /
-- caption fixes). `account_review` has neither and so cannot mutate.
drop policy if exists projects_insert_account_delegate on public.projects;
create policy projects_insert_account_delegate on public.projects
  for insert to authenticated
  with check (
    (
      curator_id is not null
      and (
        public.has_active_account_delegate_perm(curator_id, 'manage_works')
        or public.has_active_account_delegate_perm(curator_id, 'edit_metadata')
      )
    )
    or (
      host_profile_id is not null
      and (
        public.has_active_account_delegate_perm(host_profile_id, 'manage_works')
        or public.has_active_account_delegate_perm(host_profile_id, 'edit_metadata')
      )
    )
  );

drop policy if exists projects_update_account_delegate on public.projects;
create policy projects_update_account_delegate on public.projects
  for update to authenticated
  using (
    (
      curator_id is not null
      and (
        public.has_active_account_delegate_perm(curator_id, 'manage_works')
        or public.has_active_account_delegate_perm(curator_id, 'edit_metadata')
      )
    )
    or (
      host_profile_id is not null
      and (
        public.has_active_account_delegate_perm(host_profile_id, 'manage_works')
        or public.has_active_account_delegate_perm(host_profile_id, 'edit_metadata')
      )
    )
  )
  with check (
    (
      curator_id is not null
      and (
        public.has_active_account_delegate_perm(curator_id, 'manage_works')
        or public.has_active_account_delegate_perm(curator_id, 'edit_metadata')
      )
    )
    or (
      host_profile_id is not null
      and (
        public.has_active_account_delegate_perm(host_profile_id, 'manage_works')
        or public.has_active_account_delegate_perm(host_profile_id, 'edit_metadata')
      )
    )
  );

drop policy if exists projects_delete_account_delegate on public.projects;
create policy projects_delete_account_delegate on public.projects
  for delete to authenticated
  using (
    (
      curator_id is not null
      and (
        public.has_active_account_delegate_perm(curator_id, 'manage_works')
        or public.has_active_account_delegate_perm(curator_id, 'edit_metadata')
      )
    )
    or (
      host_profile_id is not null
      and (
        public.has_active_account_delegate_perm(host_profile_id, 'manage_works')
        or public.has_active_account_delegate_perm(host_profile_id, 'edit_metadata')
      )
    )
  );

-- ───────────────────────── exhibition_works ─────────────────
drop policy if exists exhibition_works_insert_account_delegate on public.exhibition_works;
create policy exhibition_works_insert_account_delegate on public.exhibition_works
  for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (
          (p.curator_id is not null
            and public.has_active_account_delegate_perm(p.curator_id, 'manage_works'))
          or (p.host_profile_id is not null
            and public.has_active_account_delegate_perm(p.host_profile_id, 'manage_works'))
        )
    )
  );

drop policy if exists exhibition_works_update_account_delegate on public.exhibition_works;
create policy exhibition_works_update_account_delegate on public.exhibition_works
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (
          (p.curator_id is not null
            and public.has_active_account_delegate_perm(p.curator_id, 'manage_works'))
          or (p.host_profile_id is not null
            and public.has_active_account_delegate_perm(p.host_profile_id, 'manage_works'))
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (
          (p.curator_id is not null
            and public.has_active_account_delegate_perm(p.curator_id, 'manage_works'))
          or (p.host_profile_id is not null
            and public.has_active_account_delegate_perm(p.host_profile_id, 'manage_works'))
        )
    )
  );

drop policy if exists exhibition_works_delete_account_delegate on public.exhibition_works;
create policy exhibition_works_delete_account_delegate on public.exhibition_works
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (
          (p.curator_id is not null
            and public.has_active_account_delegate_perm(p.curator_id, 'manage_works'))
          or (p.host_profile_id is not null
            and public.has_active_account_delegate_perm(p.host_profile_id, 'manage_works'))
        )
    )
  );

-- ───────────────────────── claims ───────────────────────────
-- claims_select_account_delegate stays as-is (review must read claims).
-- update/delete now require `manage_claims`.
drop policy if exists claims_update_account_delegate on public.claims;
create policy claims_update_account_delegate on public.claims
  for update to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.has_active_account_delegate_perm(public.artwork_artist_id(work_id), 'manage_claims')
  )
  with check (
    work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.has_active_account_delegate_perm(public.artwork_artist_id(work_id), 'manage_claims')
  );

drop policy if exists claims_delete_account_delegate on public.claims;
create policy claims_delete_account_delegate on public.claims
  for delete to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.has_active_account_delegate_perm(public.artwork_artist_id(work_id), 'manage_claims')
  );

-- ───────────────────────── price inquiries ──────────────────
-- can_reply_to_price_inquiry now requires `manage_inquiries` for the
-- account-delegate path. Owner & project-delegate paths are unchanged.
create or replace function public.can_reply_to_price_inquiry(p_artwork_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    public.price_inquiry_artist_id(p_artwork_id) = auth.uid()
    or exists (
      select 1 from public.get_current_delegate_ids(p_artwork_id) g
      where g = auth.uid()
    )
    or (
      public.price_inquiry_artist_id(p_artwork_id) is not null
      and public.has_active_account_delegate_perm(
        public.price_inquiry_artist_id(p_artwork_id),
        'manage_inquiries'
      )
    )
  );
$$;

-- can_select_price_inquiry stays as-is: review preset must see inquiries
-- to advise on them; only replying is gated on manage_inquiries.

commit;
