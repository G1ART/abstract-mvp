/**
 * Persona tab filtering for profile/My artworks.
 */
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";

export type PersonaTab = "all" | "CREATED" | "OWNS" | "INVENTORY" | "CURATED";

export function filterArtworksByPersona(
  artworks: ArtworkWithLikes[],
  profileId: string,
  tab: PersonaTab
): ArtworkWithLikes[] {
  if (tab === "all") return artworks;
  if (tab === "CREATED") {
    return artworks.filter((a) => a.artist_id === profileId);
  }
  return artworks.filter((a) => {
    const claims = a.claims ?? [];
    return claims.some(
      (c) => c.subject_profile_id === profileId && c.claim_type === tab
    );
  });
}

export function getPersonaCounts(artworks: ArtworkWithLikes[], profileId: string) {
  const all = artworks.length;
  const created = artworks.filter((a) => a.artist_id === profileId).length;
  const owns = artworks.filter((a) =>
    (a.claims ?? []).some(
      (c) => c.subject_profile_id === profileId && c.claim_type === "OWNS"
    )
  ).length;
  const inventory = artworks.filter((a) =>
    (a.claims ?? []).some(
      (c) => c.subject_profile_id === profileId && c.claim_type === "INVENTORY"
    )
  ).length;
  const curated = artworks.filter((a) =>
    (a.claims ?? []).some(
      (c) => c.subject_profile_id === profileId && c.claim_type === "CURATED"
    )
  ).length;
  return { all, created, owns, inventory, curated };
}
