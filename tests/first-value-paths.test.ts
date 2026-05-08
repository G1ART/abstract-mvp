// Sprint 7 Phase F — First-value path selector invariants.
//
// Behavioural + static checks for the FirstValuePathPanel selector.
// The selector is purely deterministic so we exercise it directly
// instead of via UI snapshots.
//
//   1. Every persona has at least 3 actions in its catalog.
//   2. `getFirstValueActions` always returns at most 3 actions.
//   3. `getFirstValueActions` never returns 0 actions for a known
//      persona — the panel must never end in a dead "all clear".
//   4. Every returned action declares titleKey, descriptionKey, href,
//      priority, completionSignal, and is telemetrySafe.
//   5. Multi-persona path remains available even when role data is
//      missing — the resolver MUST NOT force a permanent account type.
//   6. No forbidden CRM language appears in selector source.
//   7. `toTelemetryActionPayload` exposes only allowlisted keys.
//   8. The selector responds to urgency: a pending access request
//      bumps `review_access_requests` into the top 3 for gallery /
//      curator personas.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FIRST_VALUE_ACTION_KINDS,
  FORBIDDEN_PERSONA_TERMS,
  PERSONA_MODES,
  getFirstValueActions,
  toTelemetryActionPayload,
  type FirstValueAction,
  type PersonaMode,
} from "../src/lib/persona/actionGrammar";
import { resolvePersonaMode } from "../src/lib/persona/resolvePersonaMode";

const ROOT = path.resolve(__dirname, "..");

function emptyInput(persona: PersonaMode) {
  return {
    personaMode: persona,
    actingAs: false,
    profileCompleteness: 0,
    artworkCount: 0,
    publicArtworkCount: 0,
    missingArtworkContextCount: 0,
    roomCount: 0,
    pendingAccessRequestCount: 0,
    relationshipCount: 0,
    hasPrivateNote: false,
    savedOrFollowedCount: 0,
  };
}

(async () => {
  // 1 + 4 + 5 — selector returns 1..3 fully-formed actions for every
  // persona regardless of input completeness.
  for (const persona of PERSONA_MODES) {
    const actions = getFirstValueActions(emptyInput(persona));
    assert.ok(
      actions.length >= 1 && actions.length <= 3,
      `${persona}: selector must return 1..3 actions, got ${actions.length}`
    );
    for (const a of actions as FirstValueAction[]) {
      assert.ok(a.id, `${persona}: action.id required`);
      assert.ok(a.titleKey, `${persona}: ${a.id} titleKey required`);
      assert.ok(a.descriptionKey, `${persona}: ${a.id} descriptionKey required`);
      assert.ok(a.href, `${persona}: ${a.id} href required`);
      assert.ok(typeof a.priority === "number", `${persona}: ${a.id} priority`);
      assert.ok(a.completionSignal, `${persona}: ${a.id} completionSignal`);
      assert.equal(
        a.telemetrySafe,
        true,
        `${persona}: ${a.id} must be telemetrySafe`
      );
      assert.ok(
        FIRST_VALUE_ACTION_KINDS.includes(a.actionKind),
        `${persona}: ${a.id} actionKind must be in the canonical enum`
      );
    }
  }

  // 2 — even the most populated input never returns more than 3.
  const heavy = {
    personaMode: "artist" as PersonaMode,
    actingAs: false,
    profileCompleteness: 50,
    artworkCount: 1,
    publicArtworkCount: 0,
    missingArtworkContextCount: 5,
    roomCount: 0,
    pendingAccessRequestCount: 4,
    relationshipCount: 6,
    hasPrivateNote: true,
    savedOrFollowedCount: 0,
  };
  assert.ok(
    getFirstValueActions(heavy).length <= 3,
    "selector must cap returned actions at 3"
  );

  // 3 — never zero. Try the "all done" extreme.
  const done = {
    personaMode: "artist" as PersonaMode,
    actingAs: false,
    profileCompleteness: 100,
    artworkCount: 50,
    publicArtworkCount: 50,
    missingArtworkContextCount: 0,
    roomCount: 5,
    pendingAccessRequestCount: 0,
    relationshipCount: 50,
    hasPrivateNote: true,
    savedOrFollowedCount: 50,
  };
  assert.ok(
    getFirstValueActions(done).length >= 1,
    "selector must never return 0 actions for a known persona (no dead all-clear state)"
  );

  // 5 — multi-persona resolver doesn't force an account type when
  // roles are missing.
  assert.equal(
    resolvePersonaMode({ actingAs: false, mainRole: null, roles: null }),
    "multi_persona",
    "resolver must default to multi_persona when role data is missing"
  );
  // Acting-as flips us into gallery (operator-style guidance).
  assert.equal(
    resolvePersonaMode({ actingAs: true, mainRole: null, roles: null }),
    "gallery",
    "resolver must surface gallery catalog when acting-as a delegate"
  );
  // Pure roles map cleanly.
  assert.equal(
    resolvePersonaMode({
      actingAs: false,
      mainRole: "artist",
      roles: ["artist"],
    }),
    "artist"
  );
  assert.equal(
    resolvePersonaMode({
      actingAs: false,
      mainRole: "collector",
      roles: ["collector"],
    }),
    "collector"
  );
  // Multi-persona when both sides have *real* activity.
  assert.equal(
    resolvePersonaMode({
      actingAs: false,
      mainRole: "artist",
      roles: ["artist", "collector"],
      artworkCount: 5,
      savedOrFollowedCount: 5,
    }),
    "multi_persona"
  );

  // 6 — forbidden CRM terms never appear in the selector source.
  const grammarSrc = readFileSync(
    path.join(ROOT, "src/lib/persona/actionGrammar.ts"),
    "utf8"
  );
  const stripped = grammarSrc
    .replace(/export const FORBIDDEN_PERSONA_TERMS[\s\S]*?\] as const;/m, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  for (const term of FORBIDDEN_PERSONA_TERMS) {
    assert.ok(
      !new RegExp(`\\b${term}\\b`, "i").test(stripped),
      `actionGrammar.ts must not contain forbidden CRM term: ${term}`
    );
  }

  // 7 — telemetry payload exposes only allowlisted keys.
  const sample = getFirstValueActions(emptyInput("gallery"))[0];
  assert.ok(sample, "gallery must yield at least one action for sampling");
  const payload = toTelemetryActionPayload(sample);
  const allowedKeys = new Set(["action_id", "action_kind", "persona_mode"]);
  for (const k of Object.keys(payload)) {
    assert.ok(
      allowedKeys.has(k),
      `toTelemetryActionPayload exposed forbidden key ${k}`
    );
  }

  // 8 — urgency boost: a pending access request must place
  // review_access_requests in the top 3 for gallery (the persona
  // that actually owns the inbox). Curator / collector are the
  // *requester* side and intentionally do not carry a review action.
  {
    const urgent = {
      ...emptyInput("gallery"),
      pendingAccessRequestCount: 3,
    };
    const top3 = getFirstValueActions(urgent);
    assert.ok(
      top3.some((a) => a.actionKind === "review_access_requests"),
      "gallery: pending access request must surface review_access_requests in top 3"
    );
  }

  console.log("first-value-paths.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
