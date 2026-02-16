-- Backfill CREATED claims for existing artworks where artist created and no claim exists
insert into public.claims (subject_profile_id, claim_type, work_id, project_id, artist_profile_id, visibility)
select a.artist_id, 'CREATED', a.id, null, a.artist_id, 'public'
from public.artworks a
where a.visibility = 'public'
  and a.artist_id is not null
  and not exists (
    select 1 from public.claims c
    where c.work_id = a.id and c.claim_type = 'CREATED'
  );
