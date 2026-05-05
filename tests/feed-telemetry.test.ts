// Stub Supabase env *before* the helper graph loads — telemetry.ts pulls in
// `@/lib/supabase/client` indirectly (via `logBetaEvent`), and the official
// supabase-js client throws on construction when given an empty URL.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://test.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

import assert from "node:assert/strict";

/**
 * Feed telemetry helper unit tests.
 *
 * Scope: pure sessionStorage / SSR-fallback behaviour. Network-side
 * events (`logBetaEvent` → Supabase) are intentionally not exercised
 * here — those go through `tests/ai-safety.mjs` / e2e where a real
 * supabase client is available. The contract this file guards:
 *
 *   1. `setFeedSource` → `peekFeedSource` round-trip without consuming;
 *   2. `consumeFeedSource` clears the breadcrumb;
 *   3. expired sources (older than the 30-min TTL) are auto-evicted;
 *   4. `createImpressionTracker` returns a safe no-op when the host
 *      lacks `IntersectionObserver` (SSR / unsupported environments).
 *
 * The test injects a tiny `window.sessionStorage` shim *before* the
 * module is loaded so the helper picks the browser branch.
 */

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const storage = new FakeStorage();
const fakeWindow = { sessionStorage: storage } as unknown as Window & typeof globalThis;

(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow;
// Cast to any for the global IntersectionObserver patch — the real DOM lib
// is a complex generic that node's globalThis does not declare.
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
  class FakeIO {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

async function run() {
  const mod = await import("../src/lib/feed/telemetry");

  // ── setFeedSource → peekFeedSource → consumeFeedSource ─────────────
  {
    storage.clear();
    mod.setFeedSource({
      tab: "all",
      sort: "latest",
      item_kind: "artwork",
      item_id: "art-1",
      position: 3,
    });
    const a = mod.peekFeedSource();
    assert.ok(a, "peek returns a context after set");
    assert.equal(a!.item_id, "art-1");
    assert.equal(a!.tab, "all");
    assert.equal(a!.surface, "feed");
    assert.equal(a!.position, 3);

    // peek must not consume.
    const b = mod.peekFeedSource();
    assert.equal(b?.item_id, "art-1", "peek is non-destructive");

    const consumed = mod.consumeFeedSource();
    assert.equal(consumed?.item_id, "art-1", "consume returns the value");
    assert.equal(mod.peekFeedSource(), null, "consume clears the breadcrumb");
  }

  // ── Expired source auto-evicts ─────────────────────────────────────
  {
    storage.clear();
    mod.setFeedSource({
      tab: "following",
      item_kind: "exhibition",
      item_id: "exh-1",
      position: 5,
    });
    const raw = storage.getItem("ab_feed_click_source");
    assert.ok(raw, "raw source persists in sessionStorage");
    const parsed = JSON.parse(raw!) as { ts: number };
    parsed.ts = Date.now() - 31 * 60 * 1000;
    storage.setItem("ab_feed_click_source", JSON.stringify(parsed));
    assert.equal(
      mod.peekFeedSource(),
      null,
      "expired source is treated as absent and evicted"
    );
    assert.equal(
      storage.getItem("ab_feed_click_source"),
      null,
      "expired source is removed from storage on read"
    );
  }

  // ── Impression tracker is a no-op when IntersectionObserver missing
  {
    const original = (globalThis as unknown as { IntersectionObserver: unknown })
      .IntersectionObserver;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    const tracker = mod.createImpressionTracker({ tab: "all", sort: "latest" });
    tracker.observe({} as Element, {
      item_kind: "artwork",
      item_key: "art-x",
      item_id: "x",
      position: 1,
    });
    tracker.flush();
    tracker.disconnect();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      original;
  }

  console.log("feed-telemetry.test.ts: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
