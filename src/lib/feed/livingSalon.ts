import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/exhibitionCredits";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import { isPublicSurfaceVisible } from "./visibility";
import type { DiscoveryDatum, FeedEntry } from "./types";

/**
 * Artwork tile variants in the Living Salon grid.
 * - `standard`: default tile — one column on mobile, four columns on desktop.
 * - `anchor`: visually slightly larger anchor inside a dense row. Never
 *   full-viewport; the grid clamps anchor height so no single artwork
 *   dominates the first screen (see Work Order §F2).
 * - `quiet`: reserved for future dense regions; rendered identically to
 *   `standard` in v1.
 */
export type LivingSalonArtworkVariant = "standard" | "anchor" | "quiet";

/**
 * Personas for "people-introducing" strips. Each persona has a different
 * label, copy, and rendering rule (artist gets inline thumbs, others stay
 * text-only). Profiles whose `main_role` is none of these are not surfaced
 * in the feed at all.
 */
export type LivingSalonPersona =
  | "artist"
  | "curator"
  | "gallerist"
  | "collector";

export const LIVING_SALON_PERSONAS: readonly LivingSalonPersona[] = [
  "artist",
  "curator",
  "gallerist",
  "collector",
] as const;

export type LivingSalonItem =
  | {
      kind: "artwork";
      key: string;
      artwork: ArtworkWithLikes;
      variant: LivingSalonArtworkVariant;
    }
  | {
      kind: "exhibition_strip";
      key: string;
      exhibition: ExhibitionWithCredits;
    }
  | {
      kind: "artist_world";
      key: string;
      profile: PeopleRec;
      persona: LivingSalonPersona;
      artworks: ArtworkWithLikes[];
    };

export type BuildLivingSalonInput = {
  entries: FeedEntry[];
  discoveryData: DiscoveryDatum[];
  /**
   * Reserved for future viewport-aware tweaks (e.g. fewer anchors on tiny
   * screens). v1 builds the same presentation array for every viewport and
   * lets CSS handle responsive spans.
   */
  viewport?: "desktop" | "mobile";
};

const OPENING_REGION = 6;
const ANCHOR_INDEX_PRIMARY = 3;
const ANCHOR_INDEX_FALLBACK = 4;
/** Artist-persona strips need at least this many public artworks to render. */
const ARTIST_WORLD_MIN_ARTWORKS = 2;
/** Exhibition strips need at least this many cover thumbs. Exhibitions with
 * 0–1 covers read as empty / awkward in the feed; we drop them at the
 * builder entrance so they never reach the surface. */
const EXHIBITION_MIN_COVERS = 2;
/** Minimum artwork-or-exhibition tiles between two artist-world strips. */
const ARTIST_WORLD_MIN_GAP = 5;
/** Maximum consecutive artworks from the same artist before we try to swap. */
const SAME_ARTIST_RUN_LIMIT = 2;
/** Minimum gap (tiles) between two adjacent context modules. */
const CONTEXT_MIN_GAP = 4;

/**
 * Build the Living Salon presentation array.
 *
 * Pure / deterministic: same input always produces the same output. No
 * randomness, no clock reads — that lets QA take stable screenshots and lets
 * us cache results between renders without surprise reflow.
 *
 * Guarantees (Work Order §A2 / §5.3):
 * 1. Drops orphan / private-artist artworks via `isPublicSurfaceVisible`,
 *    forming a defensive second filter on top of the data helpers.
 * 2. The first item is never a context module (artist-world / exhibition).
 * 3. Up to one `anchor` artwork sits in the opening region (idx 3 or 4),
 *    only when that index actually holds an artwork.
 * 4. Artist-world strips appear only when the candidate profile already has
 *    `>= 2` public artworks, and the first such strip waits until at least
 *    `OPENING_REGION` tiles have rendered.
 * 5. Two context modules never sit back-to-back (sparse pools degrade
 *    gracefully — we just emit what we have rather than crash).
 * 6. Same-artist runs above `SAME_ARTIST_RUN_LIMIT` are softened by swapping
 *    in the next non-same-artist artwork when one is available later in the
 *    queue.
 * 7. Item keys are stable and unique; duplicates by id are dropped.
 */
export function buildLivingSalonItems(
  input: BuildLivingSalonInput
): LivingSalonItem[] {
  const safeEntries = filterEntries(input.entries);
  const orderedArtworks = collectArtworks(safeEntries);
  const orderedExhibitions = collectExhibitions(safeEntries);
  const orderedDiscovery = filterDiscovery(input.discoveryData);

  const artworkQueue = softenSameArtistRuns(orderedArtworks);

  const items: LivingSalonItem[] = [];
  const seenKeys = new Set<string>();
  let artworkIdx = 0;
  let exhibitionIdx = 0;
  let discoveryIdx = 0;
  /** Tiles emitted since the last context module (artist_world / exhibition). */
  let tilesSinceContext = Number.POSITIVE_INFINITY;
  /** Tiles emitted since the last artist_world specifically. */
  let tilesSinceArtistWorld = Number.POSITIVE_INFINITY;
  let anchorAssigned = false;

  function pushUnique(item: LivingSalonItem) {
    if (seenKeys.has(item.key)) return;
    seenKeys.add(item.key);
    items.push(item);
  }

  function takeArtwork(): LivingSalonItem | null {
    if (artworkIdx >= artworkQueue.length) return null;
    const artwork = artworkQueue[artworkIdx++];
    return {
      kind: "artwork",
      key: `art-${artwork.id}`,
      artwork,
      variant: "standard",
    };
  }

  function takeExhibitionStrip(): LivingSalonItem | null {
    if (exhibitionIdx >= orderedExhibitions.length) return null;
    const exhibition = orderedExhibitions[exhibitionIdx++];
    return {
      kind: "exhibition_strip",
      key: `exh-${exhibition.id}`,
      exhibition,
    };
  }

  function takeArtistWorld(): LivingSalonItem | null {
    while (discoveryIdx < orderedDiscovery.length) {
      const datum = orderedDiscovery[discoveryIdx++];
      const persona = parsePersona(datum.profile.main_role);
      if (persona == null) continue;
      // Artist personas need a minimum public artwork count so the inline
      // thumb row is never empty. Other personas surface as text-only and
      // ignore the artworks count.
      if (
        persona === "artist" &&
        datum.artworks.length < ARTIST_WORLD_MIN_ARTWORKS
      ) {
        continue;
      }
      return {
        kind: "artist_world",
        key: `aw-${datum.profile.id}`,
        profile: datum.profile,
        persona,
        // Only artist personas render thumbs; pass through up to 4 so the
        // strip can show an inline row. Non-artist personas ignore this.
        artworks: persona === "artist" ? datum.artworks.slice(0, 4) : [],
      };
    }
    return null;
  }

  function emit(item: LivingSalonItem) {
    pushUnique(item);
    if (item.kind === "artwork" || item.kind === "exhibition_strip") {
      // Exhibition strips count as both a tile and a context module.
      if (item.kind === "exhibition_strip") {
        tilesSinceContext = 0;
        tilesSinceArtistWorld += 1;
      } else {
        tilesSinceContext += 1;
        tilesSinceArtistWorld += 1;
      }
    } else {
      tilesSinceContext = 0;
      tilesSinceArtistWorld = 0;
    }
  }

  while (
    artworkIdx < artworkQueue.length ||
    exhibitionIdx < orderedExhibitions.length ||
    discoveryIdx < orderedDiscovery.length
  ) {
    const renderedCount = items.length;

    // Artist-world: only after opening region, with a minimum gap, and never
    // back-to-back with another context module.
    const canPlaceArtistWorld =
      renderedCount >= OPENING_REGION &&
      tilesSinceArtistWorld >= ARTIST_WORLD_MIN_GAP &&
      tilesSinceContext >= CONTEXT_MIN_GAP &&
      // The previous emitted item must not itself be a context module.
      !isLastItemContext(items);
    if (canPlaceArtistWorld) {
      const aw = takeArtistWorld();
      if (aw) {
        emit(aw);
        continue;
      }
    }

    // Exhibition strips drop in once we've seeded enough artworks and the
    // last item wasn't itself a context module.
    const canPlaceExhibition =
      renderedCount >= OPENING_REGION / 2 &&
      tilesSinceContext >= CONTEXT_MIN_GAP &&
      !isLastItemContext(items);
    if (canPlaceExhibition && exhibitionIdx < orderedExhibitions.length) {
      // Lightly varied rhythm: every (5 + idx % 3) tiles or when the artwork
      // queue is exhausted.
      const cadence = 5 + (renderedCount % 3);
      if (
        tilesSinceContext >= cadence ||
        artworkIdx >= artworkQueue.length
      ) {
        const ex = takeExhibitionStrip();
        if (ex) {
          emit(ex);
          continue;
        }
      }
    }

    // Default: emit the next artwork.
    const art = takeArtwork();
    if (art) {
      // Anchor placement: claim idx 3 (or 4 as a fallback) when it would be
      // an artwork. Never anchor the very first tile (Work Order §F2).
      if (
        !anchorAssigned &&
        (items.length === ANCHOR_INDEX_PRIMARY ||
          items.length === ANCHOR_INDEX_FALLBACK)
      ) {
        emit({ ...art, variant: "anchor" } as LivingSalonItem);
        anchorAssigned = true;
        continue;
      }
      emit(art);
      continue;
    }

    // Sparse pool: no artworks left. Emit any remaining context modules
    // (relax the no-back-to-back rule so we don't crash on tiny pools).
    const ex = takeExhibitionStrip();
    if (ex) {
      emit(ex);
      continue;
    }
    const aw = takeArtistWorld();
    if (aw) {
      emit(aw);
      continue;
    }

    break;
  }

  return items;
}

function filterEntries(entries: FeedEntry[]): FeedEntry[] {
  const seen = new Set<string>();
  const out: FeedEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "artwork") {
      if (!isPublicSurfaceVisible(entry.artwork)) continue;
      const key = `a:${entry.artwork.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    } else {
      if (!entry.exhibition?.id) continue;
      const key = `e:${entry.exhibition.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

function collectArtworks(entries: FeedEntry[]): ArtworkWithLikes[] {
  return entries
    .filter((e): e is Extract<FeedEntry, { type: "artwork" }> => e.type === "artwork")
    .map((e) => e.artwork);
}

function collectExhibitions(entries: FeedEntry[]): ExhibitionWithCredits[] {
  return entries
    .filter(
      (e): e is Extract<FeedEntry, { type: "exhibition" }> => e.type === "exhibition"
    )
    .map((e) => e.exhibition)
    // Exhibitions with fewer than 2 cover images read as empty / awkward
    // in the salon (a single thumb floats next to a credit line). Drop
    // them at the builder entrance so they never compete for grid space.
    .filter(
      (exhibition) =>
        (exhibition.cover_image_paths?.length ?? 0) >= EXHIBITION_MIN_COVERS
    );
}

function filterDiscovery(data: DiscoveryDatum[]): DiscoveryDatum[] {
  const seen = new Set<string>();
  const out: DiscoveryDatum[] = [];
  for (const datum of data) {
    if (!datum.profile?.id) continue;
    if (seen.has(datum.profile.id)) continue;
    const persona = parsePersona(datum.profile.main_role);
    // Drop profiles whose main_role isn't one of the four supported
    // personas. The feed should never label a non-artist as "Artist's
    // world" or surface a person whose role we can't introduce.
    if (persona == null) continue;
    const safeArtworks = datum.artworks.filter(isPublicSurfaceVisible);
    // Artist personas still need the minimum public-artwork count so the
    // thumb row isn't empty. Non-artists don't render thumbs, so they
    // pass even with zero artworks.
    if (persona === "artist" && safeArtworks.length < ARTIST_WORLD_MIN_ARTWORKS) {
      continue;
    }
    seen.add(datum.profile.id);
    out.push({ profile: datum.profile, artworks: safeArtworks });
  }
  return out;
}

/**
 * Returns the canonical persona for a `main_role` value, or null when the
 * role is missing / outside the supported four.
 */
export function parsePersona(
  mainRole: string | null | undefined
): LivingSalonPersona | null {
  if (!mainRole) return null;
  const normalized = mainRole.trim().toLowerCase();
  return (LIVING_SALON_PERSONAS as readonly string[]).includes(normalized)
    ? (normalized as LivingSalonPersona)
    : null;
}

function isLastItemContext(items: LivingSalonItem[]): boolean {
  const last = items[items.length - 1];
  if (!last) return false;
  return last.kind === "artist_world" || last.kind === "exhibition_strip";
}

/**
 * Soften same-artist runs. We never reorder beyond a small local swap so the
 * presentation stays close to chronological order — the goal is only to avoid
 * showing three or four works from the same artist back-to-back when there
 * are alternatives nearby.
 */
function softenSameArtistRuns(
  artworks: ArtworkWithLikes[]
): ArtworkWithLikes[] {
  if (artworks.length <= SAME_ARTIST_RUN_LIMIT) return artworks.slice();
  const queue = artworks.slice();
  for (let i = SAME_ARTIST_RUN_LIMIT; i < queue.length; i++) {
    const prev = queue[i - 1];
    const prevPrev = queue[i - SAME_ARTIST_RUN_LIMIT];
    const cur = queue[i];
    if (
      prev.artist_id != null &&
      prev.artist_id === prevPrev.artist_id &&
      prev.artist_id === cur.artist_id
    ) {
      // Look ahead for the next artwork by a different artist and swap.
      for (let j = i + 1; j < queue.length; j++) {
        if (queue[j].artist_id !== cur.artist_id) {
          [queue[i], queue[j]] = [queue[j], queue[i]];
          break;
        }
      }
    }
  }
  return queue;
}

/**
 * Compose a deterministic mix summary for analytics payloads.
 */
export function summarizeLivingSalonMix(items: LivingSalonItem[]): {
  artworks: number;
  exhibitions: number;
  artist_worlds: number;
  anchors: number;
} {
  let artworks = 0;
  let exhibitions = 0;
  let artistWorlds = 0;
  let anchors = 0;
  for (const item of items) {
    if (item.kind === "artwork") {
      artworks += 1;
      if (item.variant === "anchor") anchors += 1;
    } else if (item.kind === "exhibition_strip") {
      exhibitions += 1;
    } else {
      artistWorlds += 1;
    }
  }
  return { artworks, exhibitions, artist_worlds: artistWorlds, anchors };
}

/**
 * First-viewport heuristic for analytics. Counts how many anchors and context
 * modules likely appear above the fold on a desktop browser. Used purely as a
 * descriptive payload — no UX hangs on it.
 */
export function summarizeFirstView(items: LivingSalonItem[]): {
  anchors: number;
  context_modules: number;
} {
  const window = items.slice(0, 8);
  let anchors = 0;
  let contextModules = 0;
  for (const item of window) {
    if (item.kind === "artwork" && item.variant === "anchor") anchors += 1;
    if (item.kind === "artist_world" || item.kind === "exhibition_strip") {
      contextModules += 1;
    }
  }
  return { anchors, context_modules: contextModules };
}
