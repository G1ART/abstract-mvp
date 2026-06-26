// QA 2026-06-26 (#10) — pin the project-scope delegate upload
// migration:
//   - new helpers exist with the right shape,
//   - storage policy gains Shape 4,
//   - artwork / artwork_images project-scope policies exist,
//   - both claim RPCs route their subject-override guard through
//     `is_active_writer_for` (not the old account-only helper).
// Static SQL source checks, mirroring tests/sprint6-delegation-principal.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const MIG_REL =
  "supabase/migrations/20260626000000_qa_project_delegate_artwork_upload.sql";

const SRC = readFileSync(path.join(ROOT, MIG_REL), "utf8");

// 1) helper signatures
assert.ok(
  /create or replace function public\.is_active_project_delegate_works_writer\(\s*p_owner_profile_id uuid\s*\)/.test(SRC),
  "is_active_project_delegate_works_writer(uuid) must be declared"
);
assert.ok(
  /'manage_works' = any\(d\.permissions\)/.test(SRC),
  "project-scope writer helper must require manage_works permission"
);
assert.ok(
  /create or replace function public\.is_active_writer_for\(/.test(SRC),
  "is_active_writer_for combined helper must be declared"
);

// 2) storage policy gains the explicit Shape 4 dispatch.
assert.ok(
  /can_manage_artworks_storage_path[\s\S]*is_active_project_delegate_works_writer\(v_folder_owner\)/.test(SRC),
  "can_manage_artworks_storage_path must allow project-scope writer on principal folder"
);

// 3) project-scope artwork(_images) policies present.
for (const want of [
  "artworks_update_project_delegate",
  "artworks_delete_project_delegate",
  "artwork_images_insert_project_delegate",
  "artwork_images_update_project_delegate",
  "artwork_images_delete_project_delegate",
]) {
  assert.ok(
    new RegExp(`create policy ${want}\\b`).test(SRC),
    `${want} policy must be created`
  );
}

// 4) claim RPCs route through the combined helper.
const claimMatches = SRC.match(/is_active_writer_for\(v_subject\)/g) ?? [];
assert.ok(
  claimMatches.length >= 2,
  "Both create_claim_for_existing_artist and create_external_artist_and_claim must use is_active_writer_for"
);

// 5) The old account-only helper must NOT remain in this file's subject
//    override branches (we explicitly replaced both).
assert.equal(
  /v_subject <> v_uid\s+then\s+if not public\.is_active_account_delegate_writer/.test(SRC),
  false,
  "Subject-override guard must no longer use is_active_account_delegate_writer alone"
);

// 6) UI: permission modal exposes scopeType filtering for project scope.
const MODAL = readFileSync(
  path.join(ROOT, "src/components/delegation/UpdatePermissionsModal.tsx"),
  "utf8"
);
assert.ok(
  /PROJECT_SCOPE_PERMISSIONS/.test(MODAL),
  "UpdatePermissionsModal must filter perms by scope for project scope"
);
assert.ok(
  /scopeType\?: string \| null/.test(MODAL),
  "UpdatePermissionsModal must accept scopeType prop"
);

console.log("project-delegate-artwork-upload.test.ts: ok");
