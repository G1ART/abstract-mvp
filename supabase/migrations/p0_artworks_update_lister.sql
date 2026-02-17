-- Allow lister (has claim) to UPDATE artwork metadata, same as artist.
drop policy if exists "Allow owner update artwork" on public.artworks;
create policy "Allow owner update artwork" on public.artworks
  for update to authenticated
  using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.claims c
      where c.work_id = artworks.id and c.subject_profile_id = auth.uid()
    )
  )
  with check (
    artist_id = auth.uid()
    or exists (
      select 1 from public.claims c
      where c.work_id = artworks.id and c.subject_profile_id = auth.uid()
    )
  );
