// Stub supabase env so importing modules that depend on the supabase
// client does not throw on construction.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://test.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

// Sprint 7.1 Phase A + B — Principal-aware Network Hub.
//
// Static checks that the Network Hub access-requests path is principal
// scoped and that the new enriched list RPC + DTO are properly wired.
//
//   1. AccessRequestsPanel imports `useActingAs` and uses
//      `effectiveOwnerProfileId = actingAsProfileId ?? sessionUserId`
//      to scope the requests list. It must NOT pass the raw session
//      uid as the owner principal anymore.
//   2. The panel calls `listAccessRequestsForOwnerEnriched` (Phase B
//      RPC wrapper), not the legacy `listAccessRequestsForMe`.
//   3. The Phase B SQL migration:
//        a) defines `list_access_requests_for_owner_v2` as SECURITY
//           DEFINER,
//        b) validates caller as owner OR active delegate writer,
//        c) returns an allowlist of identity fields ONLY
//           (display_name, username, avatar_url, main_role) — never
//           email, bio, roles[], or is_public.
//   4. The relationshipAccess wrapper exports the
//      `AccessRequestRowEnriched` type with a `requester` field
//      shaped to the allowlist.
//   5. The panel's row-identity render uses `row.requester.display_name`
//      / `requester.username` / `requester.main_role` (no UUID
//      fragment via `row.requester_profile_id.slice(...)`).
//   6. i18n keys `accessRequestInbox.actingAsHint` and
//      `accessRequestInbox.requesterUnknown` exist for both EN + KO.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

(async () => {
  const panel = read("src/components/network/AccessRequestsPanel.tsx");

  // 1 — useActingAs + effectiveOwnerProfileId pattern.
  assert.match(
    panel,
    /from\s+["']@\/context\/ActingAsContext["']/,
    "AccessRequestsPanel must import useActingAs from ActingAsContext"
  );
  assert.match(
    panel,
    /useActingAs\s*\(/,
    "AccessRequestsPanel must call useActingAs()"
  );
  assert.match(
    panel,
    /effectiveOwnerProfileId\s*=\s*actingAsProfileId\s*\?\?\s*sessionUserId/,
    "AccessRequestsPanel must compute effectiveOwnerProfileId = actingAsProfileId ?? sessionUserId"
  );
  // Negative: the legacy pattern (using session uid directly as owner
  // principal in refresh) must be gone.
  assert.doesNotMatch(
    panel,
    /listAccessRequestsForMe\s*\(\s*\{\s*ownerProfileId:\s*uid\b/,
    "AccessRequestsPanel must not pass the raw session uid as owner principal"
  );

  // 2 — uses the enriched list wrapper.
  assert.match(
    panel,
    /listAccessRequestsForOwnerEnriched/,
    "AccessRequestsPanel must call the Phase B enriched list wrapper"
  );
  assert.doesNotMatch(
    panel,
    /listAccessRequestsForMe\b/,
    "AccessRequestsPanel must no longer call listAccessRequestsForMe"
  );

  // 3 — SQL migration shape.
  const sql = read(
    "supabase/migrations/20260621000000_sprint7_1_access_request_row_identity.sql"
  );
  assert.match(
    sql,
    /create or replace function public\.list_access_requests_for_owner_v2/i,
    "SQL must define list_access_requests_for_owner_v2"
  );
  assert.match(
    sql,
    /security\s+definer/i,
    "list_access_requests_for_owner_v2 must be SECURITY DEFINER"
  );
  assert.match(
    sql,
    /is_active_account_delegate_writer\(\s*p_owner_profile_id\s*\)/,
    "list_access_requests_for_owner_v2 must validate delegate-writer principal"
  );
  // Allowlisted identity fields ONLY.
  for (const field of ["display_name", "username", "avatar_url", "main_role"]) {
    assert.ok(
      new RegExp(`'${field}'`).test(sql),
      `SQL must return ${field}`
    );
  }
  // Never return forbidden owner-side or sensitive fields.
  for (const forbidden of [
    "'email'",
    "'private_note'",
    "'audience'",
    "'bio'",
    "'roles'",
    "'is_public'",
  ]) {
    assert.ok(
      !sql.includes(forbidden),
      `SQL must NOT return ${forbidden} from the requester join`
    );
  }

  // 4 — DTO type wiring.
  const wrapperSrc = read("src/lib/supabase/relationshipAccess.ts");
  assert.match(
    wrapperSrc,
    /export\s+type\s+AccessRequestRowEnriched\s*=/,
    "relationshipAccess must export AccessRequestRowEnriched type"
  );
  assert.match(
    wrapperSrc,
    /list_access_requests_for_owner_v2/,
    "wrapper must call the new RPC"
  );
  // The DTO requester block lists allowlisted fields only.
  const requesterBlockMatch = wrapperSrc.match(
    /requester:\s*\|?\s*\{[\s\S]*?\}\s*\|\s*null/
  );
  assert.ok(
    requesterBlockMatch,
    "AccessRequestRowEnriched.requester block must be defined"
  );
  for (const field of ["display_name", "username", "avatar_url", "main_role"]) {
    assert.ok(
      requesterBlockMatch![0].includes(field),
      `AccessRequestRowEnriched.requester must include ${field}`
    );
  }

  // 5 — row UI uses requester display, not UUID fragment.
  assert.doesNotMatch(
    panel,
    /requester_profile_id\.slice\s*\(/,
    "AccessRequestsPanel row UI must not show a UUID fragment"
  );
  assert.match(
    panel,
    /requester\?\.display_name|requester\?\.username|row\.requester\b/,
    "AccessRequestsPanel row UI must render row.requester display fields"
  );

  // 6 — i18n keys exist for both locales.
  const messages = read("src/lib/i18n/messages.ts");
  for (const key of [
    "accessRequestInbox.actingAsHint",
    "accessRequestInbox.requesterUnknown",
  ]) {
    const occurrences = messages.split(`"${key}"`).length - 1;
    assert.ok(
      occurrences >= 2,
      `i18n key ${key} must be defined for both EN and KO (found ${occurrences})`
    );
  }

  console.log(
    "[sprint7-1-principal-network] OK — AccessRequestsPanel is principal-aware and the Phase B identity DTO is wired."
  );
})().catch((err) => {
  console.error("[sprint7-1-principal-network] FAILED:", err);
  process.exit(1);
});
