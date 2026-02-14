-- Artist-defined portfolio sort order.
-- Run in Supabase SQL Editor.

-- Add columns
ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS artist_sort_order bigint NULL,
  ADD COLUMN IF NOT EXISTS artist_sort_updated_at timestamptz DEFAULT now();

-- Index for efficient ordering by artist
CREATE INDEX IF NOT EXISTS idx_artworks_artist_sort
  ON public.artworks(artist_id, artist_sort_order ASC NULLS LAST, created_at DESC);

-- RLS: Ensure owner can UPDATE (including artist_sort_order).
-- If you already have an update policy, it should allow updating these columns.
-- Add/update policy if needed:
DROP POLICY IF EXISTS "Allow owner update artwork" ON artworks;
CREATE POLICY "Allow owner update artwork"
  ON artworks FOR UPDATE
  USING (auth.uid() = artist_id)
  WITH CHECK (auth.uid() = artist_id);
