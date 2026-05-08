// Sprint 7 Phase 0.1 — Passport DTO owner profile minimization.
//
// Static source-text checks pinning the Phase 0.1 closure:
//
//   1. The new migration file exists and re-defines
//      `get_artwork_passport_for_viewer` with the nested 'profiles'
//      block branching on `is_public` AND owner/delegate.
//
//   2. The bio / main_role / roles fields each redact to NULL when
//      the viewer is not owner/delegate AND the owner profile is
//      not marked public (`coalesce(is_public, true) = false`).
//
//   3. The forbidden trust-floor invariants from Sprint 6 still
//      hold for this redefinition (no to_jsonb, no invite_email
//      surfacing, no `'is_public'` key in the DTO output, no bare
//      `coalesce(v_aw.visibility, '')` enum-cast bug, real claim
//      columns only).
//
//   4. The TypeScript view-model (`RedactedArtworkPassport.profiles`)
//      already declares bio / main_role / roles as nullable so the
//      client tolerates the new redaction shape.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_REL =
  "supabase/migrations/20260620000000_sprint7_phase0_passport_owner_minimization.sql";

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

(async () => {
  const sql = read(MIGRATION_REL);
  const noComments = stripSqlComments(sql);

  // 1 — function is redefined.
  assert.ok(
    /create or replace function public\.get_artwork_passport_for_viewer\s*\(\s*p_artwork_id uuid\s*\)/i.test(
      sql
    ),
    "Sprint 7 Phase 0.1 migration must redefine get_artwork_passport_for_viewer"
  );

  // 2 — nested owner profile gate references is_public AND
  // delegates / owner. We assert the three sensitive fields each
  // collapse to null in the non-owner / non-public branch.
  for (const field of ["bio", "main_role", "roles"]) {
    const re = new RegExp(
      `'${field}'\\s*,\\s*case[\\s\\S]*?v_is_owner_or_delegate[\\s\\S]*?coalesce\\(p\\.is_public[\\s\\S]*?else null[\\s\\S]*?end`,
      "i"
    );
    assert.ok(
      re.test(noComments),
      `passport profile gate must redact '${field}' to NULL for non-owner / non-public viewers`
    );
  }

  // 3 — Sprint 6 trust-floor invariants must still hold for the
  // redefinition (forward compatibility — never regress).
  assert.ok(
    !/to_jsonb\s*\(/i.test(noComments),
    "passport DTO redefinition must not introduce to_jsonb(...)"
  );
  assert.ok(
    !/invite_email/.test(noComments),
    "passport DTO redefinition must NOT echo external_artists.invite_email"
  );
  assert.ok(
    !/'is_public'/.test(noComments),
    "passport DTO redefinition must NOT include the internal owner flag is_public as a JSON key"
  );
  assert.ok(
    !/coalesce\s*\(\s*v_aw\.visibility\s*,/i.test(noComments),
    "passport DTO redefinition must cast v_aw.visibility::text before coalescing (enum cast bug regression)"
  );
  assert.ok(
    /coalesce\s*\(\s*v_aw\.visibility::text\s*,/i.test(noComments),
    "passport DTO redefinition must use coalesce(v_aw.visibility::text, '') in visibility gate"
  );

  // 4 — sensitive identity fields preserved (so the credit line
  // and avatar still render even for fully redacted private viewers).
  for (const key of ["'id'", "'username'", "'display_name'", "'avatar_url'"]) {
    assert.ok(
      sql.includes(key),
      `passport DTO redefinition must still surface identity field ${key}`
    );
  }

  // 5 — claims columns regression guard.
  for (const col of ["c.claim_type", "c.subject_profile_id", "c.work_id"]) {
    assert.ok(
      noComments.includes(col),
      `passport DTO must reference real claims column ${col}`
    );
  }
  for (const col of [
    "c.role",
    "c.is_primary",
    "c.sort_order",
    "c.profile_id",
    "c.artwork_id",
  ]) {
    assert.ok(
      !noComments.includes(col),
      `passport DTO must NOT reference fictional claims column ${col}`
    );
  }

  // 6 — TS view model still tolerates nullable bio / main_role / roles.
  const types = read("src/lib/visibility/types.ts");
  const profileBlockMatch = types.match(
    /export\s+type\s+RedactedArtworkPassport\s*=\s*\{[\s\S]*?profiles:\s*\{[\s\S]*?bio:\s*string\s*\|\s*null;[\s\S]*?main_role:\s*string\s*\|\s*null;[\s\S]*?roles:\s*string\[\]\s*\|\s*null;/
  );
  assert.ok(
    profileBlockMatch,
    "RedactedArtworkPassport.profiles must declare bio / main_role / roles as nullable for Sprint 7 redaction"
  );

  // 7 — grants preserved for both authenticated + anon (public
  // gate still applies inside the function body).
  assert.ok(
    /grant execute on function public\.get_artwork_passport_for_viewer\(uuid\) to authenticated/i.test(
      sql
    ),
    "passport DTO redefinition must grant execute to authenticated"
  );
  assert.ok(
    /grant execute on function public\.get_artwork_passport_for_viewer\(uuid\) to anon/i.test(
      sql
    ),
    "passport DTO redefinition must grant execute to anon"
  );

  console.log("sprint7-passport-owner-minimization.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
