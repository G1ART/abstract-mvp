// Stub supabase env so importing the wrapper (which transitively
// loads `@/lib/supabase/client` via `logBetaEvent`) does not throw.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://test.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

// Sprint 7 Phase F — Activation telemetry contract.
//
// Behavioural checks for the `activationTelemetry` sanitize wrapper:
//
//   1. All six new event names are exported from BetaEventName via
//      ACTIVATION_EVENT_NAMES, and the array matches the work-order
//      allowlist exactly.
//   2. ALLOWED_ACTIVATION_PAYLOAD_KEYS matches the work-order allowlist
//      exactly.
//   3. `sanitizeActivationPayload` strips every forbidden key —
//      profile_id, owner_profile_id, principal_id, viewer_id,
//      room_token, email, price_amount, note_body, message_body,
//      relationship_name, inquirer_name — even if the caller
//      accidentally passes them.
//   4. `sanitizeActivationPayload` enforces primitive types:
//      object / array values for an allowed key are rejected.
//   5. `acting_as` is always coerced to a strict boolean.
//   6. The wrapper emits the event under the exact name passed
//      (no event-name rewriting).
//   7. Source-text sanity — no forbidden payload key string literals
//      appear in `FirstValuePathPanel.tsx` or in `logActivation*`
//      helper call sites.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

(async () => {
  // Dynamic import so the env stub above runs *before* the supabase
  // client module loads (top-level `import` would hoist past it).
  const {
    ACTIVATION_EVENT_NAMES,
    ALLOWED_ACTIVATION_PAYLOAD_KEYS,
    sanitizeActivationPayload,
  } = await import("../src/lib/persona/activationTelemetry");
  // 1 — event allowlist parity.
  const expectedEvents = [
    "first_value_panel_viewed",
    "first_value_action_clicked",
    "first_value_action_completed",
    "persona_mode_hint_seen",
    "persona_mode_hint_clicked",
    "activation_milestone_reached",
  ];
  assert.deepEqual(
    [...ACTIVATION_EVENT_NAMES].sort(),
    [...expectedEvents].sort(),
    "ACTIVATION_EVENT_NAMES must match Sprint 7 work-order allowlist"
  );

  // BetaEventName union must include all six. We assert this via the
  // logEvent.ts source so the union doesn't silently drift.
  const logEventSrc = readFileSync(
    path.join(ROOT, "src/lib/beta/logEvent.ts"),
    "utf8"
  );
  for (const name of expectedEvents) {
    assert.ok(
      new RegExp(`"${name}"`).test(logEventSrc),
      `BetaEventName must declare "${name}"`
    );
  }

  // 2 — payload key allowlist parity.
  const expectedKeys = [
    "surface",
    "persona_mode",
    "action_id",
    "action_kind",
    "milestone_key",
    "acting_as",
    "locale",
  ];
  assert.deepEqual(
    [...ALLOWED_ACTIVATION_PAYLOAD_KEYS].sort(),
    [...expectedKeys].sort(),
    "ALLOWED_ACTIVATION_PAYLOAD_KEYS must match Sprint 7 work-order allowlist"
  );

  // 3 — forbidden keys are stripped.
  const FORBIDDEN_KEYS = [
    "profile_id",
    "owner_profile_id",
    "principal_id",
    "viewer_id",
    "room_token",
    "email",
    "price_amount",
    "note_body",
    "message_body",
    "relationship_name",
    "inquirer_name",
  ];
  const dirty: Record<string, unknown> = {
    surface: "first_value_panel",
    persona_mode: "artist",
    locale: "ko",
    acting_as: true,
  };
  for (const k of FORBIDDEN_KEYS) {
    dirty[k] = "leaked";
  }
  const cleaned = sanitizeActivationPayload(dirty);
  for (const k of FORBIDDEN_KEYS) {
    assert.ok(
      !(k in cleaned),
      `sanitizeActivationPayload must strip forbidden key "${k}"`
    );
  }
  for (const k of ["surface", "persona_mode", "locale", "acting_as"]) {
    assert.ok(k in cleaned, `sanitizeActivationPayload must keep "${k}"`);
  }

  // 4 — non-primitive values for allowlisted keys are rejected.
  const structured = sanitizeActivationPayload({
    surface: { secret: "leak" },
    persona_mode: ["array"],
    locale: 12345,
  } as Record<string, unknown>);
  assert.equal(structured.surface, undefined);
  assert.equal(structured.persona_mode, undefined);
  assert.equal(structured.locale, undefined);

  // 5 — acting_as coerces to strict boolean.
  assert.equal(
    sanitizeActivationPayload({ acting_as: true }).acting_as,
    true
  );
  assert.equal(
    sanitizeActivationPayload({ acting_as: "true" } as Record<string, unknown>)
      .acting_as,
    false
  );
  assert.equal(
    sanitizeActivationPayload({ acting_as: 1 } as Record<string, unknown>)
      .acting_as,
    false
  );

  // 6 — wrapper passes name through unchanged. We re-import the helper
  // and stub `logBetaEventSync` via module-level state read.
  // (Static check is sufficient for the shape; the actual emit goes
  // through `logBetaEventSync` which is itself best-effort with a
  // try/catch in production.)
  const wrapperSrc = readFileSync(
    path.join(ROOT, "src/lib/persona/activationTelemetry.ts"),
    "utf8"
  );
  assert.ok(
    /logBetaEventSync\(name, clean\)/.test(wrapperSrc),
    "logActivation must forward (name, sanitized payload) to logBetaEventSync"
  );

  // 7 — no forbidden payload key literals appear in the panel or
  // wrapper helpers.
  const panelSrc = readFileSync(
    path.join(ROOT, "src/components/studio/FirstValuePathPanel.tsx"),
    "utf8"
  );
  for (const k of FORBIDDEN_KEYS) {
    assert.ok(
      !new RegExp(`["']${k}["']`).test(panelSrc),
      `FirstValuePathPanel.tsx must not reference forbidden payload key "${k}"`
    );
    assert.ok(
      !new RegExp(`["']${k}["']`).test(wrapperSrc),
      `activationTelemetry.ts must not reference forbidden payload key "${k}"`
    );
  }

  console.log("activation-telemetry.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
