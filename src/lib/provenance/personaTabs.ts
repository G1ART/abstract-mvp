/**
 * Persona tab filtering for profile/My artworks.
 * CREATED = works where the profile has an explicit CREATED claim (artist persona).
 * OWNS/INVENTORY/CURATED = works where the profile has that claim type (lister).
 */
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";

export type PersonaTab = "all" | "CREATED" | "OWNS" | "INVENTORY" | "CURATED";

export function filterArtworksByPersona(
  artworks: ArtworkWithLikes[],
  profileId: string,
  tab: PersonaTab
): ArtworkWithLikes[] {
  if (tab === "all") return artworks;
  return artworks.filter((a) => {
    const claims = a.claims ?? [];
    return claims.some(
      (c) => c.subject_profile_id === profileId && c.claim_type === tab
    );
  });
}

export function getPersonaCounts(artworks: ArtworkWithLikes[], profileId: string) {
  const all = artworks.length;
  const created = artworks.filter((a) =>
    (a.claims ?? []).some(
      (c) => c.subject_profile_id === profileId && c.claim_type === "CREATED"
    )
  ).length;
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
