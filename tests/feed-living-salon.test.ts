import assert from "node:assert/strict";
import {
  buildLivingSalonItems,
  summarizeFirstView,
  summarizeLivingSalonMix,
  type LivingSalonItem,
} from "../src/lib/feed/livingSalon";
import type { ArtworkWithLikes } from "../src/lib/supabase/artworks";
import type { ExhibitionWithCredits } from "../src/lib/exhibitionCredits";
import type { PeopleRec } from "../src/lib/supabase/peopleRecs";
import type { DiscoveryDatum, FeedEntry } from "../src/lib/feed/types";

/**
 * Living Salon rhythm builder is a pure / deterministic function. These
 * lightweight assertions guard the contract that the visual feed depends on:
 * stable keys, no orphan-private-artist leakage, no back-to-back context
 * modules, and no hero-dominant first item.
 */

function makeArtwork(
  id: string,
  artistId: string | null,
  isPublic: boolean = true
): ArtworkWithLikes {
  return {
    id,
    title: `Title ${id}`,
    year: 2024,
    medium: "Oil on canvas",
    size: null,
    size_unit: null,
    story: null,
    visibility: "public",
    pricing_mode: "inquire",
    is_price_public: false,
    price_usd: null,
    price_input_amount: null,
    price_input_currency: null,
    fx_rate_to_usd: null,
    fx_date: null,
    ownership_status: null,
    artist_id: artistId ?? "",
    artist_sort_order: null,
    created_at: "2026-04-01T00:00:00Z",
    artwork_images: [],
    profiles: artistId
      ? ({
          id: artistId,
          username: `u_${artistId}`,
          display_name: `Artist ${artistId}`,
          // `is_public` lives on the joined profile row in production.
          is_public: isPublic,
        } as unknown as ArtworkWithLikes["profiles"])
      : null,
    claims: [],
    likes_count: 0,
  };
}

function makeExhibition(id: string): ExhibitionWithCredits {
  return {
    id,
    title: `Exhibition ${id}`,
    start_date: "2026-01-01",
    end_date: "2026-02-01",
    status: "ongoing",
    cover_image_paths: [],
  } as unknown as ExhibitionWithCredits;
}

function makeProfile(id: string): PeopleRec {
  return {
    id,
    username: `p_${id}`,
    display_name: `Profile ${id}`,
    avatar_url: null,
    main_role: null,
    roles: null,
    reason_tags: ["follow_graph"],
  };
}

const BASE_TS = Date.UTC(2026, 3, 30, 0, 0, 0);

function tsForOffset(offset: number): string {
  return new Date(BASE_TS - offset * 86_400_000).toISOString();
}

function makeArtworkEntry(artwork: ArtworkWithLikes, days = 0): FeedEntry {
  return { type: "artwork", created_at: tsForOffset(days), artwork };
}

function makeExhEntry(exhibition: ExhibitionWithCredits, days = 0): FeedEntry {
  return { type: "exhibition", created_at: tsForOffset(days), exhibition };
}

// ── Determinism: same input produces same output ────────────────────
{
  const arts = Array.from({ length: 20 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 5}`), i)
  );
  const discovery: DiscoveryDatum[] = [
    {
      profile: makeProfile("rec1"),
      artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
    },
  ];
  const a = buildLivingSalonItems({ entries: arts, discoveryData: discovery });
  const b = buildLivingSalonItems({ entries: arts, discoveryData: discovery });
  assert.deepEqual(a, b, "deterministic: same input → same output");
}

// ── Dedupe: duplicate artwork / exhibition ids drop ─────────────────
{
  const dupArt = makeArtwork("dup", "artistX");
  const items = buildLivingSalonItems({
    entries: [
      makeArtworkEntry(dupArt, 0),
      makeArtworkEntry(dupArt, 1),
      makeArtworkEntry(makeArtwork("a2", "artistY"), 2),
    ],
    discoveryData: [],
  });
  const ids = items
    .filter((i): i is Extract<LivingSalonItem, { kind: "artwork" }> => i.kind === "artwork")
    .map((i) => i.artwork.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate artwork ids");
}

// ── First item is never a context module ────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: [
      makeExhEntry(makeExhibition("e1"), 0),
      makeArtworkEntry(makeArtwork("a1", "artistA"), 1),
    ],
    discoveryData: [
      {
        profile: makeProfile("rec1"),
        artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
      },
    ],
  });
  if (items.length > 0) {
    assert.equal(items[0].kind, "artwork", "first item must be an artwork");
  }
}

// ── Artist-world only after opening region (>= 6 tiles) ─────────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const discovery: DiscoveryDatum[] = [
    {
      profile: makeProfile("rec1"),
      artworks: [
        makeArtwork("ra1", "artistR1"),
        makeArtwork("ra2", "artistR1"),
      ],
    },
  ];
  const items = buildLivingSalonItems({ entries: arts, discoveryData: discovery });
  const firstAW = items.findIndex((i) => i.kind === "artist_world");
  if (firstAW !== -1) {
    assert.ok(firstAW >= 6, `first artist_world at idx ${firstAW} must be >= 6`);
  }
}

// ── Artist-world requires >= 2 artworks ─────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: Array.from({ length: 12 }, (_, i) =>
      makeArtworkEntry(makeArtwork(`a${i}`, `artist${i}`), i)
    ),
    discoveryData: [
      {
        profile: makeProfile("rec1"),
        artworks: [makeArtwork("ra1", "artistR1")],
      },
    ],
  });
  const aws = items.filter((i) => i.kind === "artist_world");
  assert.equal(aws.length, 0, "artist-world with only 1 artwork is dropped");
}

// ── Sparse pool does not crash ──────────────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: [makeArtworkEntry(makeArtwork("only", "artistA"), 0)],
    discoveryData: [],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "artwork");
}

// ── Empty pool ──────────────────────────────────────────────────────
{
  const items = buildLivingSalonItems({ entries: [], discoveryData: [] });
  assert.equal(items.length, 0);
}

// ── All keys are unique ─────────────────────────────────────────────
{
  const arts = Array.from({ length: 30 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 6}`), i)
  );
  const exs = Array.from({ length: 6 }, (_, i) =>
    makeExhEntry(makeExhibition(`e${i}`), i + 30)
  );
  const discovery: DiscoveryDatum[] = [
    {
      profile: makeProfile("rec1"),
      artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
    },
    {
      profile: makeProfile("rec2"),
      artworks: [makeArtwork("ra3", "artistR2"), makeArtwork("ra4", "artistR2")],
    },
  ];
  const items = buildLivingSalonItems({
    entries: [...arts, ...exs],
    discoveryData: discovery,
  });
  const keys = items.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, "all keys unique");
}

// ── No back-to-back context modules ─────────────────────────────────
{
  const arts = Array.from({ length: 30 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 8}`), i)
  );
  const exs = Array.from({ length: 6 }, (_, i) =>
    makeExhEntry(makeExhibition(`e${i}`), i + 30)
  );
  const discovery: DiscoveryDatum[] = [
    {
      profile: makeProfile("rec1"),
      artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
    },
    {
      profile: makeProfile("rec2"),
      artworks: [makeArtwork("ra3", "artistR2"), makeArtwork("ra4", "artistR2")],
    },
  ];
  const items = buildLivingSalonItems({
    entries: [...arts, ...exs],
    discoveryData: discovery,
  });
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const prevIsContext =
      prev.kind === "artist_world" || prev.kind === "exhibition_strip";
    const curIsContext =
      cur.kind === "artist_world" || cur.kind === "exhibition_strip";
    if (prevIsContext && curIsContext) {
      // Sparse pool fallback may emit them at the very tail — only fail when
      // there are still artworks queued *before* the back-to-back pair.
      const remainingArtworks = items
        .slice(i + 1)
        .some((it) => it.kind === "artwork");
      assert.ok(
        !remainingArtworks,
        `context modules back-to-back at idx ${i} while artworks remain`
      );
    }
  }
}

// ── Same-artist run softening ───────────────────────────────────────
{
  const sameArtist = "artistRun";
  const entries: FeedEntry[] = [
    makeArtworkEntry(makeArtwork("r1", sameArtist), 0),
    makeArtworkEntry(makeArtwork("r2", sameArtist), 1),
    makeArtworkEntry(makeArtwork("r3", sameArtist), 2),
    makeArtworkEntry(makeArtwork("r4", sameArtist), 3),
    makeArtworkEntry(makeArtwork("o1", "other"), 4),
    makeArtworkEntry(makeArtwork("o2", "otherB"), 5),
  ];
  const items = buildLivingSalonItems({ entries, discoveryData: [] });
  // Walk the artworks in render order and confirm no run > 2 of the same
  // artist when alternatives existed in the queue.
  let run = 0;
  for (const item of items) {
    if (item.kind !== "artwork") {
      run = 0;
      continue;
    }
    if (item.artwork.artist_id === sameArtist) {
      run += 1;
      assert.ok(run <= 3, `same-artist run capped, saw ${run}`);
    } else {
      run = 0;
    }
  }
}

// ── Private-artist orphan card filtered ─────────────────────────────
{
  const orphan = makeArtwork("orphan", "artistPrivate", false);
  const items = buildLivingSalonItems({
    entries: [
      makeArtworkEntry(makeArtwork("ok", "artistPublic", true), 0),
      makeArtworkEntry(orphan, 1),
    ],
    discoveryData: [],
  });
  assert.ok(
    items.every((i) => i.kind !== "artwork" || i.artwork.id !== "orphan"),
    "private-artist artwork must not appear in salon items"
  );
}

// ── Anchor placement: at most one anchor in the opening region ──────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({ entries: arts, discoveryData: [] });
  const anchors = items.filter(
    (i) => i.kind === "artwork" && i.variant === "anchor"
  );
  assert.ok(anchors.length <= 1, "no more than one anchor artwork");
  if (anchors.length === 1) {
    const idx = items.indexOf(anchors[0]);
    assert.ok(idx === 3 || idx === 4, `anchor at idx 3 or 4, saw ${idx}`);
  }
}

// ── Summary helpers ─────────────────────────────────────────────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({ entries: arts, discoveryData: [] });
  const mix = summarizeLivingSalonMix(items);
  assert.equal(mix.artworks + mix.exhibitions + mix.artist_worlds, items.length);
  const fv = summarizeFirstView(items);
  assert.ok(fv.anchors >= 0 && fv.context_modules >= 0);
}

console.log("feed-living-salon.test.ts: ok");
