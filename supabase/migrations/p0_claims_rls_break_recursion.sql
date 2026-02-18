-- Break RLS infinite recursion: artworks SELECT -> claims policy -> artworks -> ...
-- Claims policies must not SELECT from artworks (that re-triggers artworks RLS).
-- Use a SECURITY DEFINER function so reading artworks happens with definer rights (no RLS).

create or replace function public.artwork_artist_id(p_work_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select artist_id from public.artworks where id = p_work_id limit 1;
$$;

comment on function public.artwork_artist_id(uuid) is 'Returns artist_id for a work; used in claims RLS to avoid recursion.';

-- Recreate claims policies using the helper (no direct SELECT from artworks in policy)
drop policy if exists claims_artist_confirm on public.claims;
create policy claims_artist_confirm on public.claims
  for update
  to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) = auth.uid()
  )
  with check (
    work_id is not null
    and public.artwork_artist_id(work_id) = auth.uid()
  );

drop policy if exists claims_artist_reject on public.claims;
create policy claims_artist_reject on public.claims
  for delete
  to authenticated
  using (
    status = 'pending'
    and work_id is not null
    and public.artwork_artist_id(work_id) = auth.uid()
  );

drop policy if exists claims_select_visibility_or_owner on public.claims;
create policy claims_select_visibility_or_owner on public.claims
  for select
  to public
  using (
    (visibility = 'public' and (status is null or status = 'confirmed'))
    or subject_profile_id = auth.uid()
    or (
      work_id is not null
      and public.artwork_artist_id(work_id) = auth.uid()
    )
  );
