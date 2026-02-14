-- RLS for artwork delete feature.
-- Run in Supabase SQL Editor.

-- artworks: allow DELETE where owner
DROP POLICY IF EXISTS "Allow owner delete artwork" ON artworks;
CREATE POLICY "Allow owner delete artwork"
  ON artworks FOR DELETE
  USING (auth.uid() = artist_id);

-- artwork_images: allow SELECT (owner or public artwork), DELETE/UPDATE/INSERT (owner only)
DROP POLICY IF EXISTS "Allow owner select artwork_images" ON artwork_images;
CREATE POLICY "Allow owner select artwork_images"
  ON artwork_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM artworks a
      WHERE a.id = artwork_images.artwork_id AND a.artist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow public select artwork_images" ON artwork_images;
CREATE POLICY "Allow public select artwork_images"
  ON artwork_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM artworks a
      WHERE a.id = artwork_images.artwork_id AND a.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS "Allow owner delete artwork_images" ON artwork_images;
CREATE POLICY "Allow owner delete artwork_images"
  ON artwork_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM artworks a
      WHERE a.id = artwork_images.artwork_id AND a.artist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow owner update artwork_images" ON artwork_images;
CREATE POLICY "Allow owner update artwork_images"
  ON artwork_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM artworks a
      WHERE a.id = artwork_images.artwork_id AND a.artist_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow owner insert artwork_images" ON artwork_images;
CREATE POLICY "Allow owner insert artwork_images"
  ON artwork_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM artworks a
      WHERE a.id = artwork_images.artwork_id AND a.artist_id = auth.uid()
    )
  );
