// Stub Supabase env vars BEFORE any import that pulls the supabase
// client (priceInquiries.ts → @/lib/supabase/client). Without these
// stubs `createClient` throws at module-init time. Mirrors the pattern
// used by feed-telemetry.test.ts.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://stub.example.com";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "stub-anon-key";

import assert from "node:assert/strict";

(async () => {
  const mod = await import("../src/lib/supabase/priceInquiries");
  const { sanitizeInquirySource } = mod._testing;

  // 1. Empty input → all nullable, no surface set.
  {
    const r = sanitizeInquirySource({});
    assert.equal(r.source_surface, null);
    assert.equal(r.source_room_id, null);
    assert.equal(r.source_payload, null);
  }

  // 2. Unknown surface is rejected (CHECK constraint defense-in-depth).
  {
    const r = sanitizeInquirySource({ surface: "checkout" as unknown as "feed" });
    assert.equal(r.source_surface, null, "unknown surface must be dropped");
  }

  // 3. Known surfaces pass through.
  for (const s of ["feed", "room", "artwork", "exhibition", "profile", "direct"] as const) {
    const r = sanitizeInquirySource({ surface: s });
    assert.equal(r.source_surface, s, `surface ${s} must round-trip`);
  }

  // 4. Privacy: secret-shaped keys MUST be stripped from payload — no
  //    exceptions, this is the sprint's privacy invariant for room TOKEN
  //    and other bearer-secret attribution.
  //
  //    Sprint 4 §4.2 expansion: extended the forbidden-key set to include
  //    `apiKey`, `authorization`, and `cookie`-shaped keys so an
  //    accidental copy of a `Set-Cookie` header or an Authorization
  //    bearer token can never end up in long-lived attribution rows.
  {
    const r = sanitizeInquirySource({
      surface: "room",
      payload: {
        tab: "all",
        share_token: "S3CRET-abc-123",
        password: "no",
        secret: "nope",
        api_token: "x",
        apiKey: "AKIA...",
        authorization: "Bearer eyJ...",
        cookie: "sb-access-token=...",
        position: 4,
      },
    });
    const p = r.source_payload as Record<string, unknown>;
    assert.ok(!("share_token" in p), "share_token must be stripped");
    assert.ok(!("password" in p), "password must be stripped");
    assert.ok(!("secret" in p), "secret must be stripped");
    assert.ok(!("api_token" in p), "*_token must be stripped");
    assert.ok(!("apiKey" in p), "apiKey must be stripped");
    assert.ok(!("authorization" in p), "authorization must be stripped");
    assert.ok(!("cookie" in p), "cookie must be stripped");
    assert.equal(p.tab, "all", "non-secret keys preserved");
    assert.equal(p.position, 4, "non-secret keys preserved");
  }

  // 5. Nested objects/arrays in payload are dropped (v1 keeps payload flat
  //    so analytics rows stay compact and the privacy posture is easy to
  //    reason about).
  {
    const r = sanitizeInquirySource({
      surface: "feed",
      payload: {
        tab: "all",
        nested: { a: 1 },
        list: [1, 2, 3],
        position: 2,
      },
    });
    const p = r.source_payload as Record<string, unknown>;
    assert.ok(!("nested" in p), "nested objects must be dropped");
    assert.ok(!("list" in p), "arrays must be dropped");
    assert.equal(p.tab, "all");
    assert.equal(p.position, 2);
  }

  // 6. Payload that explodes past 1 KiB is dropped entirely so we never
  //    bloat analytics rows by mistake.
  {
    const big: Record<string, string> = {};
    for (let i = 0; i < 100; i++) big[`k${i}`] = "x".repeat(50);
    const r = sanitizeInquirySource({ surface: "feed", payload: big });
    assert.equal(r.source_payload, null, "oversized payload must be dropped");
  }

  // 7. A room source must NEVER carry a token, even if the caller hands
  //    one in by mistake — the schema column is `source_room_id` (uuid).
  //    The sanitizer only writes whitelisted fields; assert there's no
  //    field that could carry a token at all.
  {
    const r = sanitizeInquirySource({
      surface: "room",
      roomId: "11111111-1111-1111-1111-111111111111",
    });
    const keys = Object.keys(r);
    for (const k of keys) {
      assert.ok(!/token/i.test(k), `no field name may include 'token' (saw ${k})`);
    }
    assert.equal(r.source_room_id, "11111111-1111-1111-1111-111111111111");
  }

  // 8. Sprint 4 §4.2 — `direct` surface is allowed and round-trips
  //    cleanly; legacy/null rows must be representable as "no
  //    attribution" by simply omitting the source argument (the inbox
  //    chip-renderer relies on `source_surface = null` to fall through
  //    silently with no chip at all).
  {
    const direct = sanitizeInquirySource({ surface: "direct" });
    assert.equal(direct.source_surface, "direct", "direct surface allowed");
    const legacy = sanitizeInquirySource({});
    assert.equal(
      legacy.source_surface,
      null,
      "omitted surface stays null so legacy rows render chipless"
    );
  }

  // 9. Sprint 4 §4.2 — extra forbidden-key shapes must also be stripped
  //    when the key carries no value (`undefined`) — defense against
  //    accidental shorthand object literal usage like
  //    `{ apiKey, ...rest }` where a local variable named `apiKey`
  //    would otherwise be quietly captured.
  {
    const r = sanitizeInquirySource({
      surface: "feed",
      payload: { apiKey: "x", goodKey: "ok" } as Record<string, unknown>,
    });
    const p = r.source_payload as Record<string, unknown>;
    assert.ok(!("apiKey" in p));
    assert.equal(p.goodKey, "ok");
  }

  console.log("inquiry-source.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
