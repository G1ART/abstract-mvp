-- When a claim is updated to have artist_profile_id (work claim with onboarded artist),
-- propagate to artworks.artist_id so the work appears on the artist's feed.
-- Fixes: (1) Edit flow: curator changes artist from external to onboarded - artist_id was not updated
--        (2) Acts as safety net if auth trigger didn't run for external artist onboarding

create or replace function public.claims_sync_artwork_artist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only for work claims (work_id not null) with artist_profile_id set
  if new.work_id is not null and new.artist_profile_id is not null then
    update public.artworks
    set artist_id = new.artist_profile_id
    where id = new.work_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_claims_updated_sync_artwork_artist on public.claims;
create trigger on_claims_updated_sync_artwork_artist
  after insert or update of artist_profile_id, work_id
  on public.claims
  for each row
  when (new.work_id is not null and new.artist_profile_id is not null)
  execute function public.claims_sync_artwork_artist();
