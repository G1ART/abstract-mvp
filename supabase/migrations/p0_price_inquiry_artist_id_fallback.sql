-- Fallback to artworks.artist_id when no CREATED claim exists, so artists still receive
-- price inquiry notifications for works that lack a CREATED claim (e.g. backfill missed,
-- draft/non-public, or legacy data). See docs/PRICE_INQUIRY_NOTIFICATION_ANALYSIS.md.

create or replace function public.price_inquiry_artist_id(p_artwork_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.subject_profile_id from public.claims c where c.work_id = p_artwork_id and c.claim_type = 'CREATED' limit 1),
    (select a.artist_id from public.artworks a where a.id = p_artwork_id limit 1)
  );
$$;

comment on function public.price_inquiry_artist_id(uuid) is 'Artist for price inquiries: CREATED claim subject, or fallback to artworks.artist_id so notifications work when CREATED is missing.';
