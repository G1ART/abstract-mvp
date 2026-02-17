-- P0: Hotfix for Collector/Curator/Gallerist upload (provenance multi-persona).
-- 1) ensure_my_profile: return empty instead of raising when auth.uid() is null (prevents 400 from bootstrap race)
-- 2) artworks: add SELECT for public + own; add INSERT for authenticated (any artist_id - lister adds work)
-- 3) artwork_images: allow INSERT when user has claim (subject) on work, not just when artist_id = auth.uid()

-- 1) ensure_my_profile: graceful when no session
create or replace function public.ensure_my_profile()
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;  -- no session, do nothing (prevents 400)
  end if;
  perform public.ensure_profile_row();
  return query
  select p.id, p.username, p.profile_completeness, p.profile_details
  from public.profiles p
  where p.id = v_uid;
end;
$$;

-- 2) artworks: SELECT - public artworks for anyone; own artworks for artist; works with claim for lister
drop policy if exists artworks_select_public on public.artworks;
create policy artworks_select_public on public.artworks
  for select to public
  using (visibility = 'public');

drop policy if exists "Allow owner select own drafts" on public.artworks;
create policy artworks_select_own on public.artworks
  for select to authenticated
  using (artist_id = auth.uid());

-- artworks: SELECT for works where user has claim (lister/collector)
create policy artworks_select_with_claim on public.artworks
  for select to authenticated
  using (
    exists (
      select 1 from public.claims c
      where c.work_id = artworks.id and c.subject_profile_id = auth.uid()
    )
  );

-- artworks: INSERT - authenticated can add works (artist_id = creator; claim will tie lister)
create policy artworks_insert_authenticated on public.artworks
  for insert to authenticated
  with check (true);

-- artworks: DELETE - artist (creator) OR lister (has claim) can delete
drop policy if exists "Allow owner delete artwork" on public.artworks;
create policy "Allow owner delete artwork" on public.artworks
  for delete to authenticated
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.claims c
      where c.work_id = artworks.id and c.subject_profile_id = auth.uid()
    )
  );

-- 3) artwork_images: INSERT - allow when artist OR when user has claim on work (collector/curator)
drop policy if exists "Allow owner insert artwork_images" on public.artwork_images;
create policy "Allow owner insert artwork_images" on public.artwork_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and a.artist_id = auth.uid()
    )
    or exists (
      select 1 from public.claims c
      where c.work_id = artwork_images.artwork_id and c.subject_profile_id = auth.uid()
    )
  );
