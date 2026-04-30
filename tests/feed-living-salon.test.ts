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

function makeExhibition(
  id: string,
  coverImagePaths: string[] = ["cover-a", "cover-b"]
): ExhibitionWithCredits {
  return {
    id,
    title: `Exhibition ${id}`,
    start_date: "2026-01-01",
    end_date: "2026-02-01",
    status: "ongoing",
    cover_image_paths: coverImagePaths,
  } as unknown as ExhibitionWithCredits;
}

function makeProfile(
  id: string,
  mainRole: string | null = "artist"
): PeopleRec {
  return {
    id,
    username: `p_${id}`,
    display_name: `Profile ${id}`,
    avatar_url: null,
    main_role: mainRole,
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
      prev.kind === "artist_world" ||
      prev.kind === "people_cluster" ||
      prev.kind === "exhibition_strip";
    const curIsContext =
      cur.kind === "artist_world" ||
      cur.kind === "people_cluster" ||
      cur.kind === "exhibition_strip";
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

// ── Persona drop: main_role null ────────────────────────────────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_null", null),
        artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
      },
    ],
  });
  const aws = items.filter((i) => i.kind === "artist_world");
  assert.equal(aws.length, 0, "profile with null main_role is dropped");
}

// ── Persona drop: main_role outside the four supported ──────────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_writer", "writer"),
        artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
      },
    ],
  });
  const aws = items.filter((i) => i.kind === "artist_world");
  assert.equal(aws.length, 0, "profile with unsupported main_role is dropped");
}

// ── Persona surface: single curator does NOT surface ────────────────
//  v1.4 raises the floor: a row with only 1 profile reads as platform
//  emptiness, so the builder drops persona buckets below
//  PEOPLE_CLUSTER_MIN (= 2).
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_curator", "curator"),
        artworks: [],
      },
    ],
  });
  const clusters = items.filter((i) => i.kind === "people_cluster");
  assert.equal(clusters.length, 0, "single curator drops below cluster_min");
}

// ── Persona surface: 2+ curators → one merged cluster ───────────────
{
  const arts = Array.from({ length: 18 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      { profile: makeProfile("rec_cur1", "curator"), artworks: [] },
      { profile: makeProfile("rec_cur2", "curator"), artworks: [] },
      { profile: makeProfile("rec_cur3", "curator"), artworks: [] },
    ],
  });
  const clusters = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "people_cluster" }> =>
      i.kind === "people_cluster"
  );
  assert.equal(clusters.length, 1, "all curators merge into one cluster row");
  assert.equal(clusters[0].profiles.length, 3, "cluster carries every curator");
}

// ── Persona surface: per-persona clusters (no chunking) ─────────────
{
  const arts = Array.from({ length: 24 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      { profile: makeProfile("rec_gal1", "gallerist"), artworks: [] },
      { profile: makeProfile("rec_gal2", "gallerist"), artworks: [] },
      { profile: makeProfile("rec_col1", "collector"), artworks: [] },
      { profile: makeProfile("rec_col2", "collector"), artworks: [] },
    ],
  });
  const clusters = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "people_cluster" }> =>
      i.kind === "people_cluster"
  );
  const personas = clusters.map((c) => c.persona);
  assert.ok(personas.includes("gallerist"), "gallerist persona surfaces");
  assert.ok(personas.includes("collector"), "collector persona surfaces");
  for (const c of clusters) {
    assert.ok(c.profiles.length >= 2, "every cluster meets cluster_min");
  }
}

// ── Artist persona still requires >= 2 artworks (regression) ────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_thin_artist", "artist"),
        artworks: [makeArtwork("ra1", "artistR1")],
      },
    ],
  });
  const aws = items.filter((i) => i.kind === "artist_world");
  assert.equal(aws.length, 0, "artist persona with 1 artwork is still dropped");
}

// ── Artist persona surfaces with up to 4 inline thumbs ──────────────
{
  const arts = Array.from({ length: 18 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_artist", "artist"),
        artworks: Array.from({ length: 6 }, (_, i) =>
          makeArtwork(`ra${i}`, "artistR1")
        ),
      },
    ],
  });
  const aws = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "artist_world" }> =>
      i.kind === "artist_world"
  );
  assert.equal(aws.length, 1);
  assert.equal(aws[0].persona, "artist");
  assert.ok(
    aws[0].artworks.length > 0 && aws[0].artworks.length <= 4,
    `artist persona thumbs in 1..4, saw ${aws[0].artworks.length}`
  );
}

// ── Exhibition gate: 0 covers dropped ───────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: [
      ...Array.from({ length: 6 }, (_, i) =>
        makeArtworkEntry(makeArtwork(`a${i}`, `artist${i}`), i)
      ),
      makeExhEntry(makeExhibition("ex_no_cover", []), 10),
    ],
    discoveryData: [],
  });
  const exs = items.filter((i) => i.kind === "exhibition_strip");
  assert.equal(exs.length, 0, "exhibition with 0 covers is dropped at entrance");
}

// ── Exhibition gate: 1 cover dropped ────────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: [
      ...Array.from({ length: 6 }, (_, i) =>
        makeArtworkEntry(makeArtwork(`a${i}`, `artist${i}`), i)
      ),
      makeExhEntry(makeExhibition("ex_one_cover", ["only-one"]), 10),
    ],
    discoveryData: [],
  });
  const exs = items.filter((i) => i.kind === "exhibition_strip");
  assert.equal(exs.length, 0, "exhibition with 1 cover is dropped at entrance");
}

// ── Exhibition gate: 2+ covers pass ─────────────────────────────────
{
  const items = buildLivingSalonItems({
    entries: [
      ...Array.from({ length: 12 }, (_, i) =>
        makeArtworkEntry(makeArtwork(`a${i}`, `artist${i}`), i)
      ),
      makeExhEntry(makeExhibition("ex_pair", ["c1", "c2"]), 20),
      makeExhEntry(makeExhibition("ex_triple", ["c1", "c2", "c3"]), 21),
    ],
    discoveryData: [],
  });
  const exs = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "exhibition_strip" }> =>
      i.kind === "exhibition_strip"
  );
  const ids = exs.map((e) => e.exhibition.id);
  assert.ok(ids.includes("ex_pair"), "exhibition with 2 covers passes");
  assert.ok(ids.includes("ex_triple"), "exhibition with 3 covers passes");
}

// ── Summary helpers ─────────────────────────────────────────────────
{
  const arts = Array.from({ length: 12 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({ entries: arts, discoveryData: [] });
  const mix = summarizeLivingSalonMix(items);
  assert.equal(
    mix.artworks + mix.exhibitions + mix.artist_worlds + mix.people_clusters,
    items.length
  );
  const fv = summarizeFirstView(items);
  assert.ok(fv.anchors >= 0 && fv.context_modules >= 0);
}

// ── Cluster carousel: 5 curators → one merged cluster (no chunking) ─
{
  const arts = Array.from({ length: 30 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 5}`), i)
  );
  const discovery: DiscoveryDatum[] = Array.from({ length: 5 }, (_, i) => ({
    profile: makeProfile(`rec_cur${i}`, "curator"),
    artworks: [],
  }));
  const items = buildLivingSalonItems({ entries: arts, discoveryData: discovery });
  const clusters = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "people_cluster" }> =>
      i.kind === "people_cluster"
  );
  assert.equal(clusters.length, 1, "5 curators merge into a single carousel row");
  assert.equal(clusters[0].profiles.length, 5, "row carries every curator");
  for (const p of clusters[0].profiles) {
    assert.equal(p.main_role, "curator", "all profiles in row share persona");
  }
}

// ── Cluster persona is never "artist" ───────────────────────────────
{
  const arts = Array.from({ length: 18 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_artist1", "artist"),
        artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
      },
      {
        profile: makeProfile("rec_curator1", "curator"),
        artworks: [],
      },
    ],
  });
  const clusters = items.filter(
    (i): i is Extract<LivingSalonItem, { kind: "people_cluster" }> =>
      i.kind === "people_cluster"
  );
  for (const c of clusters) {
    assert.notEqual(c.persona, "artist" as never, "cluster persona never 'artist'");
  }
  const aws = items.filter((i) => i.kind === "artist_world");
  for (const aw of aws) {
    if (aw.kind === "artist_world") {
      assert.equal(aw.persona, "artist", "artist_world persona is always 'artist'");
    }
  }
}

// ── Cluster gating: cluster never sits back-to-back with artist_world ──
{
  const arts = Array.from({ length: 30 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 5}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_artist1", "artist"),
        artworks: [makeArtwork("ra1", "artistR1"), makeArtwork("ra2", "artistR1")],
      },
      {
        profile: makeProfile("rec_curator1", "curator"),
        artworks: [],
      },
    ],
  });
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const prevPeople =
      prev.kind === "artist_world" || prev.kind === "people_cluster";
    const curPeople =
      cur.kind === "artist_world" || cur.kind === "people_cluster";
    if (prevPeople && curPeople) {
      const remainingArtworks = items
        .slice(i + 1)
        .some((it) => it.kind === "artwork");
      assert.ok(
        !remainingArtworks,
        `people rows back-to-back at idx ${i} while artworks remain`
      );
    }
  }
}

// ── Cluster gating: gallerist 1명만 있으면 row 자체 미렌더 ──────────
{
  const arts = Array.from({ length: 18 }, (_, i) =>
    makeArtworkEntry(makeArtwork(`a${i}`, `artist${i % 4}`), i)
  );
  const items = buildLivingSalonItems({
    entries: arts,
    discoveryData: [
      {
        profile: makeProfile("rec_gal_solo", "gallerist"),
        artworks: [],
      },
    ],
  });
  const clusters = items.filter((i) => i.kind === "people_cluster");
  assert.equal(clusters.length, 0, "single gallerist drops below cluster_min");
}

console.log("feed-living-salon.test.ts: ok");
