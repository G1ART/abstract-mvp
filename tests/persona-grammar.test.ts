// Sprint 6 Phase A — Persona Action Grammar invariants.
//
// Pure source-text checks against `src/lib/persona/actionGrammar.ts`:
//
//   1. All five PersonaModes are exported.
//   2. Every persona mode has at least one first-value path.
//   3. Every action path declares a route (href), a telemetry event,
//      and a successSignal — no stub paths.
//   4. Forbidden CRM/scoring vocabulary never appears in the grammar
//      file (lead, prospect, hot collector, conversion, pipeline, etc.).
//   5. The product doc exists at the canonical path so onboarding,
//      copy, and Sprint 7 surfaces have a single source of truth.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ACTION_VERBS,
  FIRST_VALUE_PATHS,
  FORBIDDEN_PERSONA_TERMS,
  PERSONA_MODES,
  type ActionPath,
  type PersonaMode,
} from "../src/lib/persona/actionGrammar";

const ROOT = path.resolve(__dirname, "..");

(async () => {
  // 1. Persona mode coverage.
  const expectedModes: PersonaMode[] = [
    "artist",
    "gallery",
    "curator",
    "collector",
    "multi_persona",
  ];
  assert.deepEqual(
    [...PERSONA_MODES].sort(),
    [...expectedModes].sort(),
    "PERSONA_MODES must contain exactly the five canonical modes"
  );

  // 2. First-value path coverage.
  for (const mode of expectedModes) {
    const paths = FIRST_VALUE_PATHS[mode];
    assert.ok(
      Array.isArray(paths) && paths.length >= 1,
      `${mode} must declare at least one first-value path`
    );
    // 3. Each path must be fully wired.
    for (const p of paths as ActionPath[]) {
      assert.ok(p.id && typeof p.id === "string", `${mode}: path id required`);
      assert.ok(p.titleKey, `${mode}: path ${p.id} must declare a titleKey`);
      assert.ok(
        p.descriptionKey,
        `${mode}: path ${p.id} must declare a descriptionKey`
      );
      assert.ok(p.primary?.href, `${mode}: ${p.id} primary href required`);
      assert.ok(p.primary?.event, `${mode}: ${p.id} primary event required`);
      assert.ok(
        ACTION_VERBS.includes(p.primary.verb),
        `${mode}: ${p.id} primary verb must be in the canonical list`
      );
      if (p.secondary) {
        assert.ok(
          ACTION_VERBS.includes(p.secondary.verb),
          `${mode}: ${p.id} secondary verb must be in the canonical list`
        );
      }
      assert.ok(
        p.successSignal && p.successSignal.length > 0,
        `${mode}: ${p.id} must declare a successSignal`
      );
    }
  }

  // 4. Forbidden vocabulary scan against the grammar file source.
  // Strategy: strip the FORBIDDEN_PERSONA_TERMS array literal AND every
  // line/block comment first, so that a "we forbid lead/prospect" piece
  // of rationale doesn't trigger the check. Anything that survives is
  // *real product copy or code*, which is where the forbidden terms
  // would actually do harm.
  const grammarSrc = readFileSync(
    path.join(ROOT, "src/lib/persona/actionGrammar.ts"),
    "utf8"
  );
  const grammarWithoutGuardList = grammarSrc.replace(
    /export const FORBIDDEN_PERSONA_TERMS[\s\S]*?\] as const;/m,
    ""
  );
  const grammarStripped = grammarWithoutGuardList
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
  for (const term of FORBIDDEN_PERSONA_TERMS) {
    assert.ok(
      !new RegExp(`\\b${term}\\b`, "i").test(grammarStripped),
      `actionGrammar.ts must not contain forbidden CRM/scoring term in real code/copy: ${term}`
    );
  }

  // 5. Product doc exists.
  const docPath = path.join(ROOT, "docs/product/PERSONA_ACTION_GRAMMAR.md");
  assert.ok(
    existsSync(docPath),
    "docs/product/PERSONA_ACTION_GRAMMAR.md must exist (Sprint 6 Phase A)"
  );
  const doc = readFileSync(docPath, "utf8");
  assert.ok(
    /multi_persona/i.test(doc),
    "Persona doc must reference the multi_persona safe default"
  );
  assert.ok(
    /Forbidden vocabulary/i.test(doc),
    "Persona doc must include a Forbidden vocabulary section"
  );

  console.log("persona-grammar.test.ts: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
