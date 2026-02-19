-- Triple fallback for price_inquiry_artist_id so notifications are sent even when:
-- - No CREATED claim exists (e.g. gallery/curator upload)
-- - artworks.artist_id is null (legacy or sync failure)
-- Third fallback: from claims, use artist_profile_id (onboarded artist) or subject_profile_id (prefer CREATED).
-- See docs/PRICE_INQUIRY_NOTIFICATION_FALLOFF.md.

create or replace function public.price_inquiry_artist_id(p_artwork_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.subject_profile_id from public.claims c where c.work_id = p_artwork_id and c.claim_type = 'CREATED' limit 1),
    (select a.artist_id from public.artworks a where a.id = p_artwork_id limit 1),
    (select coalesce(c.artist_profile_id, c.subject_profile_id)
     from public.claims c
     where c.work_id = p_artwork_id and (c.artist_profile_id is not null or c.subject_profile_id is not null)
     order by case c.claim_type when 'CREATED' then 0 else 1 end
     limit 1)
  );
$$;

comment on function public.price_inquiry_artist_id(uuid) is 'Artist for price inquiries: 1) CREATED claim subject, 2) artworks.artist_id, 3) any claim artist_profile_id or subject (prefer CREATED). Ensures notification recipients exist for legacy/missing-CREATED cases.';
