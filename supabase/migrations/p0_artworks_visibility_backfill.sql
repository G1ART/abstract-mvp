-- Backfill visibility for legacy artworks so they appear in public feed.
-- Old uploads may have visibility = null; feed requires visibility = 'public'.
update public.artworks
set visibility = 'public'
where visibility is null;
