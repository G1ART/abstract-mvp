-- Storage RLS for artworks bucket.
-- Run in Supabase SQL Editor.
-- Path format: {userId}/{uuid}-{filename}
-- Ensure you have an INSERT policy for authenticated upload. This file adds DELETE only.

-- Allow delete only if path starts with auth.uid()/
DROP POLICY IF EXISTS "Allow owner delete artworks storage" ON storage.objects;
CREATE POLICY "Allow owner delete artworks storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'artworks'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
