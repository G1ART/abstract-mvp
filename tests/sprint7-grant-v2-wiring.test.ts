// Stub supabase env so importing the adapter (which loads the
// supabase client) does not throw on construction.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://test.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

// Sprint 7 Phase 0.2 — Grant v2 narrowing UI wiring.
//
// Static + behavioural checks that the AccessRequestsPanel surfaces
// the four canonical scopes (Approve / Approve for this work /
// Approve for 30 days / Decline) and that the adapter maps each
// scope onto the correct `resolveAccessRequestV2` arguments.
//
//   1. The adapter exports the four canonical scopes as a tuple.
//   2. AccessRequestsPanel imports the adapter (no direct call to
//      the legacy single-button `resolveAccessRequest`).
//   3. Each scope label key exists for both EN + KO.
//   4. The panel component source references each scope id at least
//      once (so the four-button render path can never silently drop
//      a scope through a refactor).
//   5. Adapter call shape per scope:
//      - "decline" -> action: "decline"
//      - "all" -> action: "approve" with no narrowing
//      - "this_work" + artwork subject -> grantSubjectType: "artwork"
//      - "thirty_days" -> approve + expiresAt set ~30 days out

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

(async () => {
  // Dynamic import so the env stub above runs first.
  const { ACCESS_GRANT_SCOPES, resolveAccessRequestWithScope } = await import(
    "../src/lib/access/resolveV2Adapter"
  );
  // 1 — scopes tuple parity.
  assert.deepEqual(
    [...ACCESS_GRANT_SCOPES].sort(),
    ["all", "decline", "thirty_days", "this_work"],
    "ACCESS_GRANT_SCOPES must export the four canonical Sprint 7 scopes"
  );

  // 2 — panel imports the adapter.
  const panel = read("src/components/network/AccessRequestsPanel.tsx");
  assert.ok(
    /from\s+["']@\/lib\/access\/resolveV2Adapter["']/.test(panel),
    "AccessRequestsPanel must import from @/lib/access/resolveV2Adapter"
  );
  assert.ok(
    /resolveAccessRequestWithScope/.test(panel),
    "AccessRequestsPanel must call resolveAccessRequestWithScope"
  );
  // Legacy single-shot resolveAccessRequest must no longer be the
  // default action handler — the panel routes everything through the
  // scope-aware adapter so v2 telemetry stays consistent. We extract
  // every import block from `relationshipAccess` and assert that the
  // bare identifier `resolveAccessRequest` (not `…V2`, not the new
  // adapter) is not in the symbol list.
  const relAccessImports = panel.match(
    /import\s*\{[\s\S]*?\}\s*from\s*["']@\/lib\/supabase\/relationshipAccess["'];?/g
  );
  if (relAccessImports) {
    for (const block of relAccessImports) {
      const symbols = block
        .replace(/[\s\S]*?\{([\s\S]*?)\}[\s\S]*/, "$1")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      assert.ok(
        !symbols.includes("resolveAccessRequest"),
        "AccessRequestsPanel should not import the legacy single-button resolveAccessRequest — use the v2 adapter"
      );
    }
  }

  // 3 — scope label keys exist for EN + KO.
  const messages = read("src/lib/i18n/messages.ts");
  for (const key of [
    "accessRequestInbox.narrow.all",
    "accessRequestInbox.narrow.thisWork",
    "accessRequestInbox.narrow.thirtyDays",
    "accessRequestInbox.narrow.decline",
    "accessRequestInbox.narrow.label",
    "accessRequestInbox.narrow.hint",
  ]) {
    const occurrences = messages.split(`"${key}"`).length - 1;
    assert.ok(
      occurrences >= 2,
      `messages.ts must declare "${key}" in both EN and KO (saw ${occurrences})`
    );
  }

  // 4 — every scope id is rendered by the panel.
  for (const scope of ACCESS_GRANT_SCOPES) {
    assert.ok(
      new RegExp(`["']${scope}["']`).test(panel),
      `AccessRequestsPanel must reference scope "${scope}" (button render or label switch)`
    );
  }

  // 5 — adapter call shape. We stub the supabase RPC indirectly by
  // intercepting the wrapped call via a network-level fake. Since the
  // adapter delegates straight to `resolveAccessRequestV2` which calls
  // `supabase.rpc`, we instead exercise the *adapter* with a mocked
  // RPC layer at the supabase client boundary. To keep the test pure
  // we monkey-patch `supabase.rpc` for the duration of this assertion.
  const supabaseModule = await import("../src/lib/supabase/client");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseModule.supabase as any;
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const originalRpc = supabase.rpc;
  supabase.rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: null, error: null });
  };
  try {
    await resolveAccessRequestWithScope({
      request: { id: "req-1", subject_type: "artwork", subject_id: "aw-1" },
      scope: "decline",
    });
    assert.equal(calls.at(-1)?.fn, "resolve_access_request_v2");
    assert.equal(calls.at(-1)?.args.p_action, "decline");

    await resolveAccessRequestWithScope({
      request: { id: "req-2", subject_type: "artwork", subject_id: "aw-2" },
      scope: "all",
    });
    assert.equal(calls.at(-1)?.args.p_action, "approve");
    assert.equal(calls.at(-1)?.args.p_grant_subject_type, null);
    assert.equal(calls.at(-1)?.args.p_grant_subject_id, null);
    assert.equal(calls.at(-1)?.args.p_expires_at, null);

    await resolveAccessRequestWithScope({
      request: { id: "req-3", subject_type: "artwork", subject_id: "aw-3" },
      scope: "this_work",
    });
    assert.equal(calls.at(-1)?.args.p_action, "approve");
    assert.equal(calls.at(-1)?.args.p_grant_subject_type, "artwork");
    assert.equal(calls.at(-1)?.args.p_grant_subject_id, "aw-3");

    await resolveAccessRequestWithScope({
      request: { id: "req-4", subject_type: "artwork", subject_id: "aw-4" },
      scope: "thirty_days",
    });
    assert.equal(calls.at(-1)?.args.p_action, "approve");
    const expiresAt = calls.at(-1)?.args.p_expires_at as string;
    assert.ok(
      typeof expiresAt === "string" && expiresAt.length > 0,
      "thirty_days scope must populate p_expires_at"
    );
    const days =
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    assert.ok(
      days > 28 && days < 32,
      `thirty_days scope must be ~30 days out, got ${days.toFixed(2)} days`
    );
  } finally {
    supabase.rpc = originalRpc;
  }

  console.log("sprint7-grant-v2-wiring.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
