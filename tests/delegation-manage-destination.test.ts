// QA 2026-06-26 (#11) — pin the [관리하기] routing decision so we
// never silently regress to `/edit` or `/add` for a project delegate
// who actually wants to use the exhibition hub.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://stub.example.com";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "stub-anon-key";

import assert from "node:assert/strict";

(async () => {
  const { resolveManageDestination, presetHasMutationRights } = await import(
    "../src/lib/delegation/manageDestination"
  );

  // project_co_edit → hub page (was /edit historically — QA #11).
  const coEdit = resolveManageDestination({
    scope_type: "project",
    project_id: "p1",
    preset: "project_co_edit",
  });
  assert.equal(coEdit.kind, "navigate");
  if (coEdit.kind === "navigate") {
    assert.equal(coEdit.href, "/my/exhibitions/p1");
    assert.equal(coEdit.activateActingAs, true);
  }

  // project_works_only → also hub (was /add historically — QA #11).
  const worksOnly = resolveManageDestination({
    scope_type: "project",
    project_id: "p2",
    preset: "project_works_only",
  });
  assert.equal(worksOnly.kind, "navigate");
  if (worksOnly.kind === "navigate") {
    assert.equal(worksOnly.href, "/my/exhibitions/p2");
  }

  // project_review remains stay/view-only — never silently send a
  // viewer onto a mutation surface.
  const review = resolveManageDestination({
    scope_type: "project",
    project_id: "p3",
    preset: "project_review",
  });
  assert.equal(review.kind, "stay");
  if (review.kind === "stay") {
    assert.equal(review.messageKey, "delegation.manage.reviewOnly");
  }

  // Legacy / unknown preset on project scope: hub (writer-ish default).
  const legacy = resolveManageDestination({
    scope_type: "project",
    project_id: "p4",
    preset: null,
  });
  assert.equal(legacy.kind, "navigate");
  if (legacy.kind === "navigate") {
    assert.equal(legacy.href, "/my/exhibitions/p4");
  }

  // Missing project_id → stay (don't navigate to /my/exhibitions/null).
  const noProject = resolveManageDestination({
    scope_type: "project",
    project_id: null,
    preset: "project_co_edit",
  });
  assert.equal(noProject.kind, "stay");

  // Account scope unchanged (regression guard).
  const account = resolveManageDestination({
    scope_type: "account",
    project_id: null,
    preset: "operations",
  });
  assert.equal(account.kind, "navigate");
  if (account.kind === "navigate") {
    assert.equal(account.href, "/my");
  }

  // presetHasMutationRights sanity.
  assert.equal(presetHasMutationRights("project_co_edit"), true);
  assert.equal(presetHasMutationRights("project_review"), false);
  assert.equal(presetHasMutationRights(null), false);

  console.log("delegation-manage-destination.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
