import type { ArtworkWithLikes } from "@/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "@/lib/exhibitionCredits";
import type { PeopleRec } from "@/lib/supabase/peopleRecs";
import { isPlaceholderUsername } from "@/lib/identity/placeholder";
import { isPublicSurfaceVisible } from "./visibility";
import type { DiscoveryDatum, FeedEntry } from "./types";

/**
 * Artwork tile variants in the Living Salon grid.
 * - `standard`: default tile — one column on mobile, four columns on desktop.
 * - `anchor`: visually slightly larger anchor inside a dense row. Never
 *   full-viewport; the grid clamps anchor height so no single artwork
 *   dominates the first screen (see Work Order §F2).
 * - `quiet`: reserved for future dense regions; rendered identically to
 *   `standard`.
 */
export type LivingSalonArtworkVariant = "standard" | "anchor" | "quiet";

/**
 * Personas for "people-introducing" surfaces. v1.5 unifies all four
 * personas under one carousel pattern — a single horizontal row per
 * persona — so the feed never silently omits artists or treats one
 * persona as a different visual unit. Profiles whose `main_role` is
 * none of these are not surfaced at all.
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
      kind: "people_cluster";
      key: string;
      persona: LivingSalonPersona;
      profiles: PeopleRec[];
    };

export type BuildLivingSalonInput = {
  entries: FeedEntry[];
  discoveryData: DiscoveryDatum[];
  /**
   * Reserved for future viewport-aware tweaks (e.g. fewer anchors on tiny
   * screens). Builds the same presentation array for every viewport and
   * lets CSS handle responsive spans.
   */
  viewport?: "desktop" | "mobile";
};

const OPENING_REGION = 6;
const ANCHOR_INDEX_PRIMARY = 3;
const ANCHOR_INDEX_FALLBACK = 4;
/**
 * Exhibition strips need at least this many cover thumbs. Exhibitions with
 * 0–1 covers read as empty / awkward in the feed; we drop them at the
 * builder entrance so they never reach the surface.
 */
const EXHIBITION_MIN_COVERS = 2;
/**
 * Minimum tiles between two adjacent people_cluster rows. People rows
 * never sit too close together so the salon doesn't read like a directory.
 */
const PEOPLE_CLUSTER_MIN_GAP = 5;
/** Minimum profiles required to render a people_cluster row. */
const PEOPLE_CLUSTER_MIN = 2;
/** Maximum consecutive artworks from the same artist before we try to swap. */
const SAME_ARTIST_RUN_LIMIT = 2;
/** Minimum gap (tiles) between two adjacent context modules. */
const CONTEXT_MIN_GAP = 4;

/**
 * Build the Living Salon presentation array.
 *
 * Pure / deterministic: same input always produces the same output. No
 * randomness, no clock reads — that lets QA take stable screenshots and
 * lets us cache results between renders without surprise reflow.
 *
 * Guarantees:
 * 1. Drops orphan / private-artist artworks via `isPublicSurfaceVisible`.
 * 2. The first item is never a context module.
 * 3. Up to one `anchor` artwork sits in the opening region (idx 3 or 4).
 * 4. People-cluster rows appear only after the opening region, with a
 *    `PEOPLE_CLUSTER_MIN_GAP` gap between rows. Each row holds a single
 *    persona and at least `PEOPLE_CLUSTER_MIN` profiles.
 * 5. Two context modules never sit back-to-back (sparse pools degrade
 *    gracefully).
 * 6. Same-artist runs above `SAME_ARTIST_RUN_LIMIT` are softened by
 *    swapping in the next non-same-artist artwork later in the queue.
 * 7. Item keys are stable and unique; duplicates by id are dropped.
 */
export function buildLivingSalonItems(
  input: BuildLivingSalonInput
): LivingSalonItem[] {
  const safeEntries = filterEntries(input.entries);
  const orderedArtworks = collectArtworks(safeEntries);
  const orderedExhibitions = collectExhibitions(safeEntries);
  const peopleClusters = buildPeopleClusters(input.discoveryData);

  const artworkQueue = softenSameArtistRuns(orderedArtworks);

  const items: LivingSalonItem[] = [];
  const seenKeys = new Set<string>();
  let artworkIdx = 0;
  let exhibitionIdx = 0;
  let clusterIdx = 0;
  let tilesSinceContext = Number.POSITIVE_INFINITY;
  let tilesSincePeople = Number.POSITIVE_INFINITY;
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

  function takePeopleCluster(): LivingSalonItem | null {
    if (clusterIdx >= peopleClusters.length) return null;
    const cluster = peopleClusters[clusterIdx++];
    return {
      kind: "people_cluster",
      key: `pc-${cluster.persona}-${cluster.profiles.map((p) => p.id).join(",")}`,
      persona: cluster.persona,
      profiles: cluster.profiles,
    };
  }

  function emit(item: LivingSalonItem) {
    pushUnique(item);
    switch (item.kind) {
      case "artwork":
        tilesSinceContext += 1;
        tilesSincePeople += 1;
        break;
      case "exhibition_strip":
        tilesSinceContext = 0;
        tilesSincePeople += 1;
        break;
      case "people_cluster":
        tilesSinceContext = 0;
        tilesSincePeople = 0;
        break;
    }
  }

  function hasMore(): boolean {
    return (
      artworkIdx < artworkQueue.length ||
      exhibitionIdx < orderedExhibitions.length ||
      clusterIdx < peopleClusters.length
    );
  }

  while (hasMore()) {
    const renderedCount = items.length;

    const canPlacePeople =
      renderedCount >= OPENING_REGION &&
      tilesSincePeople >= PEOPLE_CLUSTER_MIN_GAP &&
      tilesSinceContext >= CONTEXT_MIN_GAP &&
      !isLastItemContext(items);
    if (canPlacePeople) {
      const pc = takePeopleCluster();
      if (pc) {
        emit(pc);
        continue;
      }
    }

    const canPlaceExhibition =
      renderedCount >= OPENING_REGION / 2 &&
      tilesSinceContext >= CONTEXT_MIN_GAP &&
      !isLastItemContext(items);
    if (canPlaceExhibition && exhibitionIdx < orderedExhibitions.length) {
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

    const art = takeArtwork();
    if (art) {
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

    // Sparse pool fallback: drain remaining context modules.
    const ex = takeExhibitionStrip();
    if (ex) {
      emit(ex);
      continue;
    }
    const pc = takePeopleCluster();
    if (pc) {
      emit(pc);
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
    .filter(
      (exhibition) =>
        (exhibition.cover_image_paths?.length ?? 0) >= EXHIBITION_MIN_COVERS
    );
}

/**
 * A profile is "presentable" enough to surface in the front-facing
 * recommendation carousel only if it carries either a real
 * `display_name` *or* a real (non-placeholder) `username`. Placeholder
 * handles like `user_a8f3c102` and rows with no display name read as
 * `설정 중인 프로필 / Untitled` cards in the salon — recommending an
 * unidentifiable person is worse for trust than dropping the slot
 * silently. Beta users especially expect curated, *named* faces.
 *
 * Profiles failing this gate aren't deleted from discovery — they may
 * still appear in dedicated People-tab lanes where the empty-state
 * styling is appropriate. They just don't lead the salon's hero
 * recommendation surface.
 */
function isPresentableProfile(profile: PeopleRec): boolean {
  const dn = (profile.display_name ?? "").trim();
  if (dn) return true;
  const u = (profile.username ?? "").trim();
  if (!u) return false;
  return !isPlaceholderUsername(u);
}

/**
 * Buckets profiles by persona and emits one row per persona — a
 * horizontal carousel that stays the same visual unit across all four
 * personas (artist / curator / gallerist / collector). Buckets with
 * fewer than `PEOPLE_CLUSTER_MIN` profiles are dropped so the surface
 * never reads as a thin "1 person" row.
 *
 * Output order is `artist → curator → gallerist → collector`, preserving
 * input order within each persona — fully deterministic.
 */
export function buildPeopleClusters(
  data: DiscoveryDatum[]
): { persona: LivingSalonPersona; profiles: PeopleRec[] }[] {
  const seen = new Set<string>();
  const buckets: Record<LivingSalonPersona, PeopleRec[]> = {
    artist: [],
    curator: [],
    gallerist: [],
    collector: [],
  };
  for (const datum of data) {
    if (!datum.profile?.id) continue;
    if (seen.has(datum.profile.id)) continue;
    if (!isPresentableProfile(datum.profile)) continue;
    const persona = parsePersona(datum.profile.main_role);
    if (persona == null) continue;
    seen.add(datum.profile.id);
    buckets[persona].push(datum.profile);
  }
  const out: { persona: LivingSalonPersona; profiles: PeopleRec[] }[] = [];
  for (const persona of LIVING_SALON_PERSONAS) {
    const profiles = buckets[persona];
    if (profiles.length < PEOPLE_CLUSTER_MIN) continue;
    out.push({ persona, profiles });
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
  return (
    last.kind === "people_cluster" || last.kind === "exhibition_strip"
  );
}

/**
 * Soften same-artist runs. We never reorder beyond a small local swap so
 * the presentation stays close to chronological order — the goal is only
 * to avoid showing three or four works from the same artist back-to-back
 * when there are alternatives nearby.
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
  people_clusters: number;
  anchors: number;
} {
  let artworks = 0;
  let exhibitions = 0;
  let peopleClusters = 0;
  let anchors = 0;
  for (const item of items) {
    switch (item.kind) {
      case "artwork":
        artworks += 1;
        if (item.variant === "anchor") anchors += 1;
        break;
      case "exhibition_strip":
        exhibitions += 1;
        break;
      case "people_cluster":
        peopleClusters += 1;
        break;
    }
  }
  return {
    artworks,
    exhibitions,
    people_clusters: peopleClusters,
    anchors,
  };
}

/**
 * First-viewport heuristic for analytics. Counts how many anchors and
 * context modules likely appear above the fold on a desktop browser.
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
    if (item.kind === "people_cluster" || item.kind === "exhibition_strip") {
      contextModules += 1;
    }
  }
  return { anchors, context_modules: contextModules };
}
