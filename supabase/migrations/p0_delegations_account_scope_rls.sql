-- Account-scope delegation: allow delegate to act on delegator's behalf for artworks, exhibitions, claims, price inquiries.
-- Does NOT grant update on profiles (no profile edit on behalf; privacy-critical). Delegate may SELECT delegator profile for display.
-- Helper: is current user an active account-scope delegate of the given profile?
create or replace function public.is_account_delegate_of(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
    where d.delegate_profile_id = auth.uid()
      and d.delegator_profile_id = p_profile_id
      and d.scope_type = 'account'
      and d.status = 'active'
  );
$$;

-- Artworks: account delegate can select/update/delete/insert on behalf of delegator (artist_id = delegator).
create policy artworks_select_account_delegate on public.artworks
  for select to authenticated
  using (public.is_account_delegate_of(artist_id));

create policy artworks_update_account_delegate on public.artworks
  for update to authenticated
  using (public.is_account_delegate_of(artist_id))
  with check (public.is_account_delegate_of(artist_id));

create policy artworks_delete_account_delegate on public.artworks
  for delete to authenticated
  using (public.is_account_delegate_of(artist_id));

create policy artworks_insert_account_delegate on public.artworks
  for insert to authenticated
  with check (artist_id is not null and public.is_account_delegate_of(artist_id));

-- Artwork_images: account delegate of the artwork's artist can manage images.
create policy artwork_images_select_account_delegate on public.artwork_images
  for select to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and public.is_account_delegate_of(a.artist_id)
    )
  );

create policy artwork_images_insert_account_delegate on public.artwork_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and public.is_account_delegate_of(a.artist_id)
    )
  );

create policy artwork_images_update_account_delegate on public.artwork_images
  for update to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and public.is_account_delegate_of(a.artist_id)
    )
  )
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and public.is_account_delegate_of(a.artist_id)
    )
  );

create policy artwork_images_delete_account_delegate on public.artwork_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_images.artwork_id and public.is_account_delegate_of(a.artist_id)
    )
  );

-- Projects (exhibitions): account delegate can insert (as delegator curator), update, delete when delegator is curator or host.
create policy projects_insert_account_delegate on public.projects
  for insert to authenticated
  with check (
    (curator_id is not null and public.is_account_delegate_of(curator_id))
    or (host_profile_id is not null and public.is_account_delegate_of(host_profile_id))
  );

create policy projects_update_account_delegate on public.projects
  for update to authenticated
  using (
    public.is_account_delegate_of(curator_id)
    or (host_profile_id is not null and public.is_account_delegate_of(host_profile_id))
  )
  with check (
    public.is_account_delegate_of(curator_id)
    or (host_profile_id is not null and public.is_account_delegate_of(host_profile_id))
  );

create policy projects_delete_account_delegate on public.projects
  for delete to authenticated
  using (
    public.is_account_delegate_of(curator_id)
    or (host_profile_id is not null and public.is_account_delegate_of(host_profile_id))
  );

-- Exhibition_works: account delegate can manage when project's curator or host is their delegator.
create policy exhibition_works_insert_account_delegate on public.exhibition_works
  for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (public.is_account_delegate_of(p.curator_id) or (p.host_profile_id is not null and public.is_account_delegate_of(p.host_profile_id)))
    )
  );

create policy exhibition_works_update_account_delegate on public.exhibition_works
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (public.is_account_delegate_of(p.curator_id) or (p.host_profile_id is not null and public.is_account_delegate_of(p.host_profile_id)))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (public.is_account_delegate_of(p.curator_id) or (p.host_profile_id is not null and public.is_account_delegate_of(p.host_profile_id)))
    )
  );

create policy exhibition_works_delete_account_delegate on public.exhibition_works
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (public.is_account_delegate_of(p.curator_id) or (p.host_profile_id is not null and public.is_account_delegate_of(p.host_profile_id)))
    )
  );

-- Claims: account delegate of artwork's artist can select (pending), update (confirm), delete (reject).
create policy claims_select_account_delegate on public.claims
  for select to authenticated
  using (
    work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.is_account_delegate_of(public.artwork_artist_id(work_id))
  );

create policy claims_update_account_delegate on public.claims
  for update to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.is_account_delegate_of(public.artwork_artist_id(work_id))
  )
  with check (
    work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.is_account_delegate_of(public.artwork_artist_id(work_id))
  );

create policy claims_delete_account_delegate on public.claims
  for delete to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) is not null
    and public.is_account_delegate_of(public.artwork_artist_id(work_id))
  );

-- Price inquiries: extend helpers so account delegate of artist can reply and select.
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
      and public.is_account_delegate_of(public.price_inquiry_artist_id(p_artwork_id))
    )
  );
$$;

create or replace function public.can_select_price_inquiry(p_artwork_id uuid, p_inquirer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    p_inquirer_id = auth.uid()
    or public.price_inquiry_artist_id(p_artwork_id) = auth.uid()
    or exists (select 1 from public.get_current_delegate_ids(p_artwork_id) g where g = auth.uid())
    or (
      public.price_inquiry_artist_id(p_artwork_id) is not null
      and public.is_account_delegate_of(public.price_inquiry_artist_id(p_artwork_id))
    )
  );
$$;

-- Profiles: account delegate may SELECT delegator's profile (for "acting as" display only; no update).
create policy profiles_select_account_delegate on public.profiles
  for select to authenticated
  using (public.is_account_delegate_of(id));
