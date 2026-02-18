-- Claim request/confirm: claims can be pending (request) or confirmed (artist approved).
-- Requester (collector/curator) creates claim with status='pending'.
-- Artist (work owner) can set status='confirmed'. Provenance only shows confirmed.

alter table public.claims
  add column if not exists status text not null default 'confirmed';

comment on column public.claims.status is 'pending = awaiting artist confirmation; confirmed = visible in provenance';

-- Backfill: existing rows stay confirmed
update public.claims set status = 'confirmed' where status is null or status = '';

-- Constraint
alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims add constraint claims_status_check check (status in ('pending', 'confirmed'));

create index if not exists idx_claims_status on public.claims(status);
create index if not exists idx_claims_work_status on public.claims(work_id, status) where work_id is not null;

-- Artist can confirm pending claims on their works (update status only)
drop policy if exists claims_update_owner on public.claims;
drop policy if exists claims_insert_update_delete_owner on public.claims;

create policy claims_insert_update_delete_owner on public.claims
  for all
  to authenticated
  using (subject_profile_id = auth.uid())
  with check (subject_profile_id = auth.uid());

-- Artist can update status of pending claims on their artworks (confirm)
create policy claims_artist_confirm on public.claims
  for update
  to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and exists (
      select 1 from public.artworks a
      where a.id = claims.work_id and a.artist_id = auth.uid()
    )
  )
  with check (
    work_id is not null
    and exists (
      select 1 from public.artworks a
      where a.id = claims.work_id and a.artist_id = auth.uid()
    )
  );

-- Artist can delete pending claims on their artworks (reject)
create policy claims_artist_reject on public.claims
  for delete
  to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and exists (
      select 1 from public.artworks a
      where a.id = claims.work_id and a.artist_id = auth.uid()
    )
  );

-- Pending claims: only requester and work artist can see. Public = confirmed only.
drop policy if exists claims_select_visibility_or_owner on public.claims;
create policy claims_select_visibility_or_owner on public.claims
  for select
  to public
  using (
    (visibility = 'public' and (status is null or status = 'confirmed'))
    or subject_profile_id = auth.uid()
    or (
      work_id is not null
      and exists (
        select 1 from public.artworks a
        where a.id = claims.work_id and a.artist_id = auth.uid()
      )
    )
  );
