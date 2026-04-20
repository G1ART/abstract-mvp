#!/usr/bin/env node
// AI Wave 1 hardening — static safety regression tests.
//
// These tests are intentionally grep-level: they fail the PR if anyone
// re-introduces one of the patterns Wave 1 hardening explicitly removed.
// A real unit runner is out of scope for this patch; until we wire one up
// this script enforces the trust-boundary invariants mechanically.
//
// Invariants checked:
//   1. No AI assist surface auto-fires on mount (no `useEffect` → `trigger`
//      inside `src/components/ai/*` or `src/components/studio/intelligence/*`).
//   2. No AI route sends outbound messages (no supabase `.insert` into
//      `price_inquiry_messages`, `notifications`, `follows`, or any
//      `resend`/`sgMail`/`fetch('https://')` pattern in `src/app/api/ai/*`).
//   3. No caller hardcodes `locale: "ko"` anywhere in `src/`; locale must
//      always come from `useT().locale`.
//
// Usage: `node tests/ai-safety.mjs`

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function readAll(root, predicate) {
  return walk(root)
    .filter(predicate)
    .map((p) => ({ path: p, body: readFileSync(p, "utf8") }));
}

const failures = [];

function fail(message) {
  failures.push(message);
}

// --- Invariant 1: no auto-fire on mount in AI surfaces ----------------
{
  const aiSurfaces = [
    join(repoRoot, "src/components/ai"),
    join(repoRoot, "src/components/studio/intelligence"),
  ];
  for (const dir of aiSurfaces) {
    const files = readAll(dir, (p) => p.endsWith(".tsx") || p.endsWith(".ts"));
    for (const { path, body } of files) {
      // Forbidden pattern: useEffect that calls trigger()/fetch*/callAi*.
      // We keep this regex loose but targeted: any useEffect that references
      // the symbol `trigger` is flagged, because Wave 1 hardening requires
      // all AI generations behind an explicit button press.
      const matches = body.match(/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g) || [];
      for (const m of matches) {
        if (/\btrigger\s*\(/.test(m)) {
          fail(
            `[trust-boundary] AI surface auto-fires on mount: ${relative(repoRoot, path)}\n  match: ${m.replace(/\s+/g, " ").slice(0, 120)}…`,
          );
        }
      }
    }
  }
}

// --- Invariant 2: AI routes never send outbound messages ---------------
{
  const aiRouteRoot = join(repoRoot, "src/app/api/ai");
  const files = readAll(aiRouteRoot, (p) => p.endsWith("route.ts"));
  const outboundPatterns = [
    { re: /\.from\(\s*['"]price_inquiry_messages['"]\s*\)/, label: "price_inquiry_messages insert" },
    { re: /\.from\(\s*['"]notifications['"]\s*\)\s*\.insert/, label: "notifications insert" },
    { re: /\.from\(\s*['"]follows['"]\s*\)\s*\.insert/, label: "follows insert" },
    { re: /sendNotification|sendEmail|resend\.send|sgMail|nodemailer/, label: "email/notification send" },
    { re: /fetch\(\s*['"]https?:\/\/(?!api\.openai\.com)/, label: "external HTTP call" },
  ];
  for (const { path, body } of files) {
    for (const { re, label } of outboundPatterns) {
      if (re.test(body)) {
        fail(
          `[outbound] AI route appears to send ${label}: ${relative(repoRoot, path)}`,
        );
      }
    }
  }
}

// --- Invariant 3: no hardcoded locale: "ko" ----------------------------
{
  const srcRoot = join(repoRoot, "src");
  const files = readAll(srcRoot, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));
  const re = /locale:\s*["']ko["']/;
  for (const { path, body } of files) {
    if (re.test(body)) {
      fail(`[locale] hardcoded locale:"ko" in ${relative(repoRoot, path)}`);
    }
  }
}

// --- Invariant 4: AI surfaces must not call window.confirm -------------
//
// Wave 2 replaces the legacy `window.confirm` in AI surfaces with the
// `ConfirmActionDialog` design-system primitive. The rule is scoped to
// `src/components/ai/**` so non-AI pages can keep their own confirm UI
// until we migrate them individually.
{
  const aiDir = join(repoRoot, "src/components/ai");
  const files = readAll(aiDir, (p) => p.endsWith(".tsx") || p.endsWith(".ts"));
  const re = /window\.confirm\s*\(/;
  for (const { path, body } of files) {
    if (re.test(body)) {
      fail(`[confirm] window.confirm() in AI surface ${relative(repoRoot, path)}`);
    }
  }
}

// --- Invariant 5: AI prompts carry their safety footers ----------------
//
// Wave 2 extends the prompt safety policy. We grep for specific phrases
// that must stay inside the system prompts so a future refactor can't
// silently drop them.
{
  const promptsPath = join(repoRoot, "src/lib/ai/prompts/index.ts");
  const body = readFileSync(promptsPath, "utf8");
  const required = [
    // Profile Copilot must never propose identity changes.
    { key: "PROFILE_COPILOT_SYSTEM", phrase: /do not (?:suggest|propose) changes to (?:username|role|public)/i },
    // Inquiry Reply must never invent price or ownership.
    { key: "INQUIRY_REPLY_SYSTEM", phrase: /do not invent (?:price|ownership|provenance)/i },
  ];
  for (const { key, phrase } of required) {
    const block = body.split(key)[1] ?? "";
    if (!phrase.test(block)) {
      fail(`[prompt-safety] ${key} missing required phrase ${phrase}`);
    }
  }
}

if (failures.length) {
  console.error("AI safety regressions:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("AI safety: all invariants hold.");
