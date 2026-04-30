import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/exhibitionCredits";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";

/**
 * Time-ordered feed material before presentation. The shape is shared by the
 * feed fetcher (`FeedContent`) and the Living Salon presentation builder
 * (`buildLivingSalonItems`) so both speak the same vocabulary.
 */
export type FeedEntry =
  | { type: "artwork"; created_at: string | null; artwork: ArtworkWithLikes }
  | { type: "exhibition"; created_at: string | null; exhibition: ExhibitionWithCredits };

/**
 * Artist-world recommendation pairing — one suggested profile and a small
 * curated set of their public artworks. Built by `FeedContent` and consumed
 * by `buildLivingSalonItems` to seed `artist_world` strips.
 */
export type DiscoveryDatum = {
  profile: PeopleRec;
  artworks: ArtworkWithLikes[];
};
