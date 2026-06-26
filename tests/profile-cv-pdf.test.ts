// QA 2026-06-26 (Wave 5 #6) — profile CV PDF SQL contract.
// We intentionally don't import the runtime storage module here
// because it pulls in the supabase client (requires env). The
// guard-rails we care most about are SQL-shaped and unit-testable
// from the migration files alone.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(__dirname, "..", "supabase", "migrations");

// 1) lookup_profile_by_username must surface cv_pdf_path on the public
//    branch so the profile page can render the download chip without
//    a second round-trip. It must also keep `viewer_follow_status`
//    (regression check — see 20260626300000 header).
const lookup = readdirSync(migrationsDir)
  .filter((name) => name.includes("lookup_profile_cv_pdf"))
  .sort()
  .pop();
assert.ok(lookup, "expected lookup_profile_cv_pdf migration to exist");
const lookupSql = readFileSync(join(migrationsDir, lookup!), "utf8");
assert.match(lookupSql, /'cv_pdf_path',\s*rec\.cv_pdf_path/);
assert.match(lookupSql, /'viewer_follow_status',\s*v_status/);

// 2) update_my_cv_pdf_path migration must reject paths outside the
//    owner folder so a stolen JWT can't point cv_pdf_path at someone
//    else's storage object.
const rpc = readdirSync(migrationsDir)
  .filter((name) => name.includes("cv_pdf_rpc"))
  .sort()
  .pop();
assert.ok(rpc, "expected cv_pdf_rpc migration to exist");
const rpcSql = readFileSync(join(migrationsDir, rpc!), "utf8");
assert.match(rpcSql, /not like \(v_uid::text \|\| '\/%'\)/);
assert.match(rpcSql, /security definer/);

// 3) Schema migration must declare the column so production matches
//    the RPC's update target.
const schema = readdirSync(migrationsDir)
  .filter((name) => name.includes("wave5_schema_extensions"))
  .sort()
  .pop();
assert.ok(schema, "expected wave5_schema_extensions migration to exist");
const schemaSql = readFileSync(join(migrationsDir, schema!), "utf8");
assert.match(schemaSql, /add column if not exists cv_pdf_path text/);

console.log("profile-cv-pdf.test.ts: ok");
