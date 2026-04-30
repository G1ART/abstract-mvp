import type { ArtworkWithLikes } from "@/lib/supabase/artworks";

/**
 * Defensive client-side filter against orphan / private-artist artwork rows.
 *
 * The data helpers (`listPublicArtworks*`) already apply RLS, but in the rare
 * case where a misaligned policy lets an artwork row through while the joined
 * `profiles` row is gated, we'd render a card with no attributable artist
 * (the "Unknown user" leak). This filter drops those rows.
 *
 * Lives in `src/lib/feed/` so it can be imported from both the supabase
 * helpers and the Living Salon builder without dragging the supabase client
 * (a side-effectful module) into pure / testable code paths.
 */
export function isPublicSurfaceVisible(row: ArtworkWithLikes): boolean {
  const artistProfile = (row as unknown as {
    profiles?: { id?: string | null; is_public?: boolean | null } | null;
  }).profiles;
  if (row.artist_id == null) return true;
  if (!artistProfile || !artistProfile.id) return false;
  if (artistProfile.is_public === false) return false;
  return true;
}
