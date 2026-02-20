/**
 * Persona tab filtering for profile/My artworks.
 * CREATED = works where the profile has an explicit CREATED claim (artist persona).
 * OWNS/INVENTORY/CURATED = works where the profile has that claim type (lister).
 */
import type { ArtworkWithLikes } from "@/lib/supabase/artworks";

export type PersonaTab = "all" | "exhibitions" | "CREATED" | "OWNS" | "INVENTORY" | "CURATED";

export function filterArtworksByPersona(
  artworks: ArtworkWithLikes[],
  profileId: string,
  tab: PersonaTab
): ArtworkWithLikes[] {
  if (tab === "all" || tab === "exhibitions") return artworks;
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

export type PersonaTabItem = { tab: PersonaTab; count: number };

type Counts = { all: number; created: number; owns: number; inventory: number; curated: number };
type RoleOptions = { main_role: string | null; roles: string[] };

/**
 * Returns persona tabs in role-based default order.
 * When user has multiple personas (e.g. artist + curator), main_role decides the primary order:
 * - main_role "curator" → exhibitions first, then CURATED, then all.
 * - main_role "gallerist" → exhibitions first, then INVENTORY, then all.
 * - main_role "collector" → OWNS first, then exhibitions, then all.
 * - main_role "artist" or null/other → artist order: all first, then exhibitions, then CREATED/OWNS/INVENTORY/CURATED.
 * Tab order can later be made user-reorderable (persisted in profile/settings).
 */
export function getOrderedPersonaTabs(
  counts: Counts,
  exhibitionsCount: number,
  options: RoleOptions
): PersonaTabItem[] {
  const { main_role, roles } = options;
  const has = (r: string) => roles.includes(r) || main_role === r;
  const isArtist = counts.created > 0;
  const isCollector = counts.owns > 0 || has("collector");
  const isCurator = counts.curated > 0 || has("curator");
  const isGallery = counts.inventory > 0 || has("gallerist");

  const exhibitionItem: PersonaTabItem | null =
    exhibitionsCount > 0 ? { tab: "exhibitions", count: exhibitionsCount } : null;
  const allItem: PersonaTabItem = { tab: "all", count: counts.all };
  const createdItem = counts.created > 0 ? { tab: "CREATED" as PersonaTab, count: counts.created } : null;
  const ownsItem = counts.owns > 0 ? { tab: "OWNS" as PersonaTab, count: counts.owns } : null;
  const inventoryItem = counts.inventory > 0 ? { tab: "INVENTORY" as PersonaTab, count: counts.inventory } : null;
  const curatedItem = counts.curated > 0 ? { tab: "CURATED" as PersonaTab, count: counts.curated } : null;

  const filt = <T,>(arr: (T | null)[]): T[] => arr.filter((x): x is T => x != null);

  if (main_role === "collector" && isCollector) {
    return filt([ownsItem, exhibitionItem, allItem, createdItem, inventoryItem, curatedItem]);
  }

  if (main_role === "curator" && isCurator) {
    return filt([exhibitionItem, curatedItem, allItem, ownsItem, inventoryItem]);
  }

  if (main_role === "gallerist" && isGallery) {
    return filt([exhibitionItem, inventoryItem, allItem, ownsItem, curatedItem]);
  }

  if (isArtist) {
    return filt([
      allItem,
      exhibitionItem,
      createdItem,
      ownsItem,
      inventoryItem,
      curatedItem,
    ]);
  }

  const nonArtistRest = filt([createdItem, ownsItem, inventoryItem, curatedItem]);
  return filt([exhibitionItem]).concat(nonArtistRest, [allItem]);
}
