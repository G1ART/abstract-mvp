-- Support 'draft' visibility for bulk upload.
-- Run in Supabase SQL Editor.
-- If you get "policy already exists" errors, drop conflicting policies first.

-- Allow owner to select own draft artworks
DROP POLICY IF EXISTS "Allow owner select own drafts" ON artworks;
CREATE POLICY "Allow owner select own drafts"
  ON artworks FOR SELECT
  USING (artist_id = auth.uid() AND visibility = 'draft');
