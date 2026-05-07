// Sprint 6 Phase 0 — Trust-Floor Closure invariants.
//
// Static source-text checks pinning the three trust-floor closures:
//
//   1. The Sprint 6 SQL migration re-emits the artwork passport DTO
//      via explicit allowlists. `to_jsonb(p)` (whole-row) must NOT
//      appear inside `get_artwork_passport_for_viewer`. The forbidden
//      `invite_email` field on `external_artists` must not surface in
//      that function. The internal owner flag `is_public` must not be
//      embedded in the nested profile payload.
//
//   2. The Sprint 6 SQL migration defines `resolve_room_source_from_token`
//      and the wrapper exists in `src/lib/supabase/relationshipAccess.ts`.
//
//   3. The artwork detail page no longer calls the legacy
//      `getRoomByToken` (replaced by the attribution-safe
//      `resolveRoomSourceFromToken`). The artwork detail page also
//      renders the price inquiry block when the price is gated
//      (priceIsGated trigger), even if `pricing_mode` was nullified
//      server-side.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_REL =
  "supabase/migrations/20260608000000_sprint6_phase0_and_relationship_desk.sql";

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function sectionFor(sql: string, fnName: string): string | null {
  const sections = sql.split(/-- == SECTION \d+ ==/);
  return sections.find((s) => s.includes(`function public.${fnName}(`)) ?? null;
}

(async () => {
  const sql = read(MIGRATION_REL);
  const wrappers = read("src/lib/supabase/relationshipAccess.ts");
  const artworkPage = read("src/app/artwork/[id]/page.tsx");

  // 1.A — get_artwork_passport_for_viewer must be re-emitted with
  // explicit allowlists. The function body must not contain to_jsonb,
  // and must not embed `invite_email` or `is_public`. We strip SQL
  // line comments first so a "we used to use to_jsonb" rationale
  // doesn't trip the check.
  const passport = sectionFor(sql, "get_artwork_passport_for_viewer");
  assert.ok(passport, "Sprint 6 migration must re-define get_artwork_passport_for_viewer");
  const passportNoComments = passport!
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.ok(
    !/to_jsonb\s*\(/i.test(passportNoComments),
    "passport DTO must not use to_jsonb(...) anywhere — explicit allowlists only"
  );
  assert.ok(
    !/invite_email/.test(passportNoComments),
    "passport DTO must NOT echo external_artists.invite_email"
  );
  assert.ok(
    !/'is_public'/.test(passportNoComments),
    "passport DTO must NOT include the internal owner flag is_public"
  );
  // Sanity: the new build still surfaces canonical public profile fields.
  for (const key of ["'username'", "'display_name'", "'avatar_url'", "'main_role'"]) {
    assert.ok(
      passport!.includes(key),
      `passport DTO must still surface public profile field ${key}`
    );
  }

  // 1.B — TS view model must drop the `is_public` field on the
  // redacted profile shape (matches the SQL DTO).
  const types = read("src/lib/visibility/types.ts");
  const redactedProfileBlock =
    types.match(/profiles:\s*\{[^}]*\}\s*\|\s*null;/m)?.[0] ?? "";
  assert.ok(
    !/is_public/.test(redactedProfileBlock),
    "RedactedArtworkPassport.profiles must NOT include is_public after Sprint 6 hardening"
  );

  // 2 — resolve_room_source_from_token RPC + wrapper.
  assert.ok(
    /create or replace function public\.resolve_room_source_from_token\s*\(\s*p_token text\s*,\s*p_artwork_id uuid\s*\)/i.test(
      sql
    ),
    "resolve_room_source_from_token(text, uuid) must be defined"
  );
  assert.ok(
    /grant execute on function public\.resolve_room_source_from_token\(text, uuid\) to anon/i.test(
      sql
    ),
    "resolve_room_source_from_token must be granted to anon"
  );
  assert.ok(
    wrappers.includes("resolveRoomSourceFromToken"),
    "TypeScript wrapper resolveRoomSourceFromToken must exist"
  );

  // 3.A — artwork page must call the new attribution resolver and
  // must NOT call the legacy getRoomByToken.
  assert.ok(
    artworkPage.includes("resolveRoomSourceFromToken"),
    "artwork detail must call resolveRoomSourceFromToken"
  );
  assert.ok(
    !/getRoomByToken\s*\(/.test(artworkPage),
    "artwork detail must not call legacy getRoomByToken"
  );

  // 3.B — gated price inquiry continuity. The page must derive a
  // `priceIsGated` boolean and include it in the showPriceInquiryBlock
  // condition, so a fully redacted price still opens the inquiry path.
  assert.ok(
    /priceIsGated/.test(artworkPage),
    "artwork detail must compute a priceIsGated trigger for gated viewers"
  );
  assert.ok(
    /showPriceInquiryBlock[\s\S]{0,400}priceIsGated/.test(artworkPage),
    "showPriceInquiryBlock must include priceIsGated as a trigger"
  );

  console.log("sprint6-trust-floor.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
