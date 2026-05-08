// Sprint 7 — Resolve a `PersonaMode` from a profile + acting-as
// context. Deterministic and side-effect free.
//
// Persona ≠ account type (see actionGrammar.ts). This helper is a
// session-time *intent* hint: which set of first-value actions makes
// the most sense to surface right now? The user is never forced into
// a persona — they can navigate freely regardless of what we pick.
//
// Resolution rules (in order):
//
//   1. If the user is acting-as a delegate, surface the gallery
//      catalog (operators most often act for galleries / artists
//      with their own studio surfaces).
//   2. If the role set contains both an "owner-style" role (artist /
//      gallery / curator) AND a viewer-style role (collector), AND
//      there is real activity on both sides (artwork count > 0 AND
//      saved/followed > 0), prefer multi_persona.
//   3. If the role set is purely artist → artist; gallery → gallery;
//      curator → curator; collector → collector.
//   4. If multiple roles exist, prefer the most "owner-leaning" role
//      that produces the most actionable first-value path: gallery
//      then artist then curator then collector.
//   5. Fallback → multi_persona (never crashes on unknown roles).

import type { PersonaMode } from "@/lib/persona/actionGrammar";

const ARTIST_ROLE = new Set(["artist", "studio", "creator"]);
const GALLERY_ROLE = new Set(["gallery", "gallerist", "dealer"]);
const CURATOR_ROLE = new Set(["curator"]);
const COLLECTOR_ROLE = new Set(["collector", "patron", "viewer"]);

function normaliseRoles(roles: readonly (string | null | undefined)[] | null | undefined): Set<string> {
  if (!roles) return new Set();
  const out = new Set<string>();
  for (const r of roles) {
    if (typeof r !== "string") continue;
    out.add(r.trim().toLowerCase());
  }
  return out;
}

export type ResolvePersonaInput = {
  mainRole?: string | null;
  roles?: readonly (string | null | undefined)[] | null;
  actingAs: boolean;
  artworkCount?: number | null;
  savedOrFollowedCount?: number | null;
};

export function resolvePersonaMode(input: ResolvePersonaInput): PersonaMode {
  if (input.actingAs) return "gallery";

  const roleSet = normaliseRoles(input.roles ?? null);
  if (input.mainRole) roleSet.add(input.mainRole.trim().toLowerCase());

  const isArtist = [...roleSet].some((r) => ARTIST_ROLE.has(r));
  const isGallery = [...roleSet].some((r) => GALLERY_ROLE.has(r));
  const isCurator = [...roleSet].some((r) => CURATOR_ROLE.has(r));
  const isCollector = [...roleSet].some((r) => COLLECTOR_ROLE.has(r));

  const ownerLike = isArtist || isGallery || isCurator;
  const viewerLike = isCollector;
  const hasArtworks = (input.artworkCount ?? 0) > 0;
  const hasFollows = (input.savedOrFollowedCount ?? 0) > 0;

  if (ownerLike && viewerLike && hasArtworks && hasFollows) {
    return "multi_persona";
  }

  if (isGallery) return "gallery";
  if (isArtist) return "artist";
  if (isCurator) return "curator";
  if (isCollector) return "collector";

  // Unknown / missing roles. Default to multi_persona so the panel
  // surfaces inclusive guidance instead of crashing or hiding itself.
  return "multi_persona";
}
