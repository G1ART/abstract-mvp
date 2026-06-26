-- QA 2026-06-26 (#10) — project-scope delegate artwork upload.
--
-- Why
-- ----
-- Before this migration, "uploading a new work attributed to the
-- delegator" only worked when the operator was an ACTIVE
-- account-scope writer delegate. Project-scope delegates — even with
-- the full `manage_works` permission on the project — could not:
--   1. write the image bytes into the principal's storage folder,
--   2. INSERT the artwork_images row that ties the upload to the work,
--   3. file the CURATED claim on the principal's behalf (the SECURITY
--      DEFINER guard in `create_claim_for_existing_artist` /
--      `create_external_artist_and_claim` only accepted
--      `is_active_account_delegate_writer`),
-- and the upload silently failed with `permission_denied` /
-- `forbidden: caller is not an active account delegate writer for
-- subject_profile_id` toasts.
--
-- This migration adds the missing project-scope counterparts so the
-- "전시 위임 → [관리하기] → 작품 추가" path works end-to-end. It is
-- additive: account-scope behaviour is untouched, owner behaviour is
-- untouched, project-scope `review` delegates remain view-only.
--
-- Scope discipline
-- ----------------
-- The new helper `is_active_project_delegate_works_writer(owner)` is
-- "OWNER-rooted" — it returns true iff the caller holds *some* active
-- project-scope delegation BY that owner WITH `manage_works`. The
-- storage / image / artwork policies cannot know which project the
-- upload is "for", so we trust the operator to be acting in a
-- legitimate project context. The actual project linking still goes
-- through `exhibition_works`, whose RLS already requires
-- per-project `manage_works`. So the over-broad part (storage bytes
-- under principal folder) is bounded: orphaned bytes don't surface on
-- any profile unless a real artwork + claim land.
--
-- Per release-workflow rule: this file contains 3 PL/pgSQL function
-- bodies. Apply section-by-section in the Supabase SQL editor (or use
-- `apply_migration` MCP which sends the whole file as one unit).

begin;

-- == SECTION 1 == helper: project-scope writer (manage_works) of an owner.
-- "Owner" = the principal who created the delegation (delegations.delegator_profile_id).
-- Used by storage / image / artwork RLS and by the claim SECURITY
-- DEFINER guards in section 6/7.

create or replace function public.is_active_project_delegate_works_writer(
  p_owner_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $a$
  select exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = p_owner_profile_id
       and d.delegate_profile_id  = auth.uid()
       and d.scope_type           = 'project'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
       and 'manage_works' = any(d.permissions)
  );
$a$;

grant execute on function public.is_active_project_delegate_works_writer(uuid)
  to authenticated;

-- == SECTION 2 == helper: combined writer for an owner.
-- account-scope writer (any non-view perm) OR project-scope writer (manage_works).
-- Centralises the "can this caller mutate on behalf of p_owner" decision
-- so we don't sprinkle two-line OR-chains across every gated surface.

create or replace function public.is_active_writer_for(
  p_owner_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $b$
  select
    public.is_active_account_delegate_writer(p_owner_profile_id)
    or public.is_active_project_delegate_works_writer(p_owner_profile_id);
$b$;

grant execute on function public.is_active_writer_for(uuid) to authenticated;

-- == SECTION 3 == storage policy broadening.
-- Adds Shape 4 to the existing helper: when the first folder segment
-- resolves to a profile id AND the caller is an active project-scope
-- writer of that profile, allow write/delete. Shapes 1-3 (owner /
-- account-scope reach / mutual cleanup) are preserved verbatim, so
-- existing flows do not regress.

create or replace function public.can_manage_artworks_storage_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $c$
declare
  v_parts text[];
  v_exhibition_id uuid;
  v_folder_owner uuid;
begin
  if auth.uid() is null or p_name is null then
    return false;
  end if;

  v_parts := storage.foldername(p_name);
  if array_length(v_parts, 1) is null then
    return false;
  end if;

  -- a) owner folder
  if v_parts[1] = auth.uid()::text then
    return true;
  end if;

  begin
    v_folder_owner := v_parts[1]::uuid;
  exception when others then
    v_folder_owner := null;
  end;

  if v_folder_owner is not null then
    -- Shape 1 (account-scope, into principal folder): caller is an
    -- active account-scope delegate of folder owner.
    if exists (
      select 1 from public.delegations d
       where d.delegator_profile_id = v_folder_owner
         and d.delegate_profile_id  = auth.uid()
         and d.scope_type           = 'account'
         and d.status               = 'active'
    ) then
      return true;
    end if;

    -- Shape 2 (mutual cleanup): folder owner is one of caller's active
    -- account-scope delegates — caller can clean leftovers.
    if exists (
      select 1 from public.delegations d
       where d.delegator_profile_id = auth.uid()
         and d.delegate_profile_id  = v_folder_owner
         and d.scope_type           = 'account'
         and d.status               = 'active'
    ) then
      return true;
    end if;

    -- Shape 3 (peer cleanup): caller and folder owner are both active
    -- account-scope delegates of the same principal.
    if exists (
      select 1
        from public.delegations d_owner
        join public.delegations d_caller
          on d_owner.delegator_profile_id = d_caller.delegator_profile_id
       where d_owner.delegate_profile_id  = v_folder_owner
         and d_owner.scope_type           = 'account'
         and d_owner.status               = 'active'
         and d_caller.delegate_profile_id = auth.uid()
         and d_caller.scope_type          = 'account'
         and d_caller.status              = 'active'
    ) then
      return true;
    end if;

    -- Shape 4 (project-scope, into principal folder) — QA 2026-06-26
    -- (#10): caller has an active project-scope `manage_works`
    -- delegation by the folder owner. Without this, exhibition
    -- delegates could not place the image bytes for a new work under
    -- the principal's portfolio root.
    if public.is_active_project_delegate_works_writer(v_folder_owner) then
      return true;
    end if;
  end if;

  -- b) exhibition-media/{uuid}/...  (curator/host or project delegate)
  if v_parts[1] = 'exhibition-media' and array_length(v_parts, 1) >= 2 then
    begin
      v_exhibition_id := v_parts[2]::uuid;
    exception when others then
      return false;
    end;

    return exists (
      select 1 from public.projects p
       where p.id = v_exhibition_id
         and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
    or exists (
      select 1 from public.delegations d
       where d.project_id          = v_exhibition_id
         and d.delegate_profile_id = auth.uid()
         and d.scope_type          = 'project'
         and d.status              = 'active'
         and ('edit_metadata' = any(d.permissions)
              or 'manage_works' = any(d.permissions))
    );
  end if;

  return false;
end;
$c$;

grant execute on function public.can_manage_artworks_storage_path(text)
  to anon, authenticated, service_role;

-- == SECTION 4 == artworks UPDATE/DELETE for project-scope writers.
-- INSERT is already `with check (true)` in
-- `artworks_insert_authenticated`, so creating the draft already
-- works. We need UPDATE so the bulk page can flip visibility=public
-- and patch fields, and DELETE so a failed upload can rollback.

drop policy if exists artworks_update_project_delegate on public.artworks;
create policy artworks_update_project_delegate on public.artworks
  for update to authenticated
  using (public.is_active_project_delegate_works_writer(artist_id))
  with check (public.is_active_project_delegate_works_writer(artist_id));

drop policy if exists artworks_delete_project_delegate on public.artworks;
create policy artworks_delete_project_delegate on public.artworks
  for delete to authenticated
  using (public.is_active_project_delegate_works_writer(artist_id));

-- == SECTION 5 == artwork_images INSERT/UPDATE/DELETE for project-scope.
-- Mirror of the account-scope policies in
-- 20260505000100_delegation_account_rls_writer.sql so the image
-- attach/replace/cleanup paths work end-to-end for project delegates.

drop policy if exists artwork_images_insert_project_delegate on public.artwork_images;
create policy artwork_images_insert_project_delegate on public.artwork_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.is_active_project_delegate_works_writer(a.artist_id)
    )
  );

drop policy if exists artwork_images_update_project_delegate on public.artwork_images;
create policy artwork_images_update_project_delegate on public.artwork_images
  for update to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.is_active_project_delegate_works_writer(a.artist_id)
    )
  )
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.is_active_project_delegate_works_writer(a.artist_id)
    )
  );

drop policy if exists artwork_images_delete_project_delegate on public.artwork_images;
create policy artwork_images_delete_project_delegate on public.artwork_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id
        and public.is_active_project_delegate_works_writer(a.artist_id)
    )
  );

-- == SECTION 6 == create_claim_for_existing_artist — accept project writer override.
-- The only change vs. 20260508000000 is `is_active_account_delegate_writer`
-- → `is_active_writer_for`. The error string keeps the original token
-- so the i18n catalog in src/lib/errors/supabase.ts continues to
-- translate it; we extend the message hint to mention project writers.

create or replace function public.create_claim_for_existing_artist(
  p_artist_profile_id  uuid,
  p_claim_type         text,
  p_work_id            uuid default null,
  p_project_id         uuid default null,
  p_visibility         text default 'public',
  p_period_status      text default null,
  p_subject_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $d$
declare
  v_uid       uuid := auth.uid();
  v_subject   uuid;
  v_claim_id  uuid;
  v_claim_row jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_artist_profile_id is null then
    raise exception 'artist_profile_id required';
  end if;
  if (p_work_id is null and p_project_id is null)
     or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
  end if;
  if p_period_status is not null
     and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  v_subject := coalesce(p_subject_profile_id, v_uid);
  if v_subject <> v_uid then
    if not public.is_active_writer_for(v_subject) then
      raise exception 'forbidden: caller is not an active account delegate writer for subject_profile_id';
    end if;
  end if;

  insert into public.claims (
    subject_profile_id, claim_type, work_id, project_id,
    artist_profile_id, visibility, period_status
  )
  values (
    v_subject, p_claim_type, p_work_id, p_project_id,
    p_artist_profile_id, p_visibility, p_period_status
  )
  returning id into v_claim_id;

  select to_jsonb(c.*) into v_claim_row from public.claims c where c.id = v_claim_id;
  return jsonb_build_object('claim', v_claim_row);
end;
$d$;

grant execute on function public.create_claim_for_existing_artist(uuid, text, uuid, uuid, text, text, uuid)
  to authenticated;

-- == SECTION 7 == create_external_artist_and_claim — accept project writer override.

create or replace function public.create_external_artist_and_claim(
  p_display_name      text,
  p_invite_email      text default null,
  p_work_id           uuid default null,
  p_project_id        uuid default null,
  p_claim_type        text default 'OWNS',
  p_website           text default null,
  p_instagram         text default null,
  p_visibility        text default 'public',
  p_period_status     text default null,
  p_subject_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $e$
declare
  v_uid        uuid := auth.uid();
  v_subject    uuid;
  v_ext_id     uuid;
  v_ext_row    jsonb;
  v_claim_row  jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;
  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'display_name must be at least 2 characters';
  end if;
  if (p_work_id is null and p_project_id is null)
     or (p_work_id is not null and p_project_id is not null) then
    raise exception 'exactly one of work_id, project_id required';
  end if;
  if p_visibility is null then
    p_visibility := 'public';
  end if;
  if p_period_status is not null
     and p_period_status not in ('past', 'current', 'future') then
    raise exception 'period_status must be past, current, or future';
  end if;

  v_subject := coalesce(p_subject_profile_id, v_uid);
  if v_subject <> v_uid then
    if not public.is_active_writer_for(v_subject) then
      raise exception 'forbidden: caller is not an active account delegate writer for subject_profile_id';
    end if;
  end if;

  insert into public.external_artists (display_name, website, instagram, invite_email, invited_by, status)
  values (
    trim(p_display_name),
    nullif(trim(p_website), ''),
    nullif(trim(p_instagram), ''),
    nullif(trim(p_invite_email), ''),
    v_uid,
    'invited'
  )
  returning id into v_ext_id;

  insert into public.claims (
    subject_profile_id, claim_type, work_id, project_id,
    external_artist_id, visibility, period_status
  )
  values (
    v_subject, p_claim_type, p_work_id, p_project_id,
    v_ext_id, p_visibility, p_period_status
  );

  select to_jsonb(e.*) into v_ext_row from public.external_artists e where e.id = v_ext_id;
  select to_jsonb(c.*) into v_claim_row
    from public.claims c
   where c.subject_profile_id = v_subject
     and c.external_artist_id = v_ext_id
   order by c.created_at desc
   limit 1;

  return jsonb_build_object('external_artist', v_ext_row, 'claim', v_claim_row);
end;
$e$;

grant execute on function public.create_external_artist_and_claim(text, text, uuid, uuid, text, text, text, text, text, uuid)
  to authenticated;

commit;
