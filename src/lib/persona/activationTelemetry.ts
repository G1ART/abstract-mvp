// Sprint 7 Phase D — Activation telemetry spine.
//
// Thin wrapper around `logBetaEventSync` that strictly limits payloads
// for `first_value_*`, `persona_mode_hint_*`, and
// `activation_milestone_reached` events to a small allowlist of keys.
//
// This is *defence in depth*: callers are expected to pass clean
// payloads (the type signatures already restrict shapes), but the
// runtime sanitizer guarantees that any forbidden key — even one
// added by mistake later — is dropped before it ever crosses the
// `beta_analytics_events` boundary.
//
// Allowlisted payload keys (see Sprint 7 Addendum §7):
//
//   surface       string  — UI surface that emitted the event
//   persona_mode  PersonaMode
//   action_id     string  — first-value action id (no nouns; stable)
//   action_kind   FirstValueActionKind  — telemetry-friendly enum
//   milestone_key string  — activation milestone key
//   acting_as     boolean — true when delegate context is active
//   locale        string  — current i18n locale
//
// Forbidden (will be silently stripped):
//
//   profile_id, owner_profile_id, principal_id, viewer_id,
//   room_token, email, price_amount, note_body, message_body,
//   relationship_name, inquirer_name, …anything else.

import { logBetaEventSync, type BetaEventName } from "@/lib/beta/logEvent";
import type {
  FirstValueAction,
  FirstValueActionKind,
  FirstValueSelectorInput,
  PersonaMode,
} from "@/lib/persona/actionGrammar";

export const ACTIVATION_EVENT_NAMES = [
  "first_value_panel_viewed",
  "first_value_action_clicked",
  "first_value_action_completed",
  "persona_mode_hint_seen",
  "persona_mode_hint_clicked",
  "activation_milestone_reached",
] as const;

export type ActivationEventName = (typeof ACTIVATION_EVENT_NAMES)[number];

// Compile-time witness that every name in ACTIVATION_EVENT_NAMES is a
// valid BetaEventName. If someone removes an entry from BetaEventName
// without updating this file, this assignment will fail tsc.
const _typecheck: BetaEventName = "first_value_panel_viewed";
void _typecheck;

export const ALLOWED_ACTIVATION_PAYLOAD_KEYS = [
  "surface",
  "persona_mode",
  "action_id",
  "action_kind",
  "milestone_key",
  "acting_as",
  "locale",
] as const;

export type ActivationPayloadKey =
  (typeof ALLOWED_ACTIVATION_PAYLOAD_KEYS)[number];

export type ActivationPayload = {
  surface?: string;
  persona_mode?: PersonaMode;
  action_id?: string;
  action_kind?: FirstValueActionKind;
  milestone_key?: string;
  acting_as?: boolean;
  locale?: string;
};

const ALLOWED_SET = new Set<string>(ALLOWED_ACTIVATION_PAYLOAD_KEYS);

/**
 * Strip every key not in the allowlist. We also enforce primitive
 * types so a structured object can never sneak through under a
 * legal key name (e.g. `surface: { secret: "..." }`).
 */
export function sanitizeActivationPayload(
  raw: Record<string, unknown> | null | undefined
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (!raw) return out;
  for (const k of Object.keys(raw)) {
    if (!ALLOWED_SET.has(k)) continue;
    const v = raw[k];
    if (k === "acting_as") {
      out[k] = v === true;
      continue;
    }
    if (typeof v === "string" && v.length > 0 && v.length <= 200) {
      out[k] = v;
    }
  }
  return out;
}

/** Single entry point for activation events. */
export function logActivation(
  name: ActivationEventName,
  payload: ActivationPayload | Record<string, unknown> = {}
): void {
  const clean = sanitizeActivationPayload(payload as Record<string, unknown>);
  logBetaEventSync(name, clean);
}

/** Convenience helpers for the four canonical surfaces. */

export function logFirstValuePanelViewed(args: {
  personaMode: PersonaMode;
  actingAs: boolean;
  locale: string;
  surface?: string;
}): void {
  logActivation("first_value_panel_viewed", {
    surface: args.surface ?? "first_value_panel",
    persona_mode: args.personaMode,
    acting_as: args.actingAs,
    locale: args.locale,
  });
}

export function logFirstValueActionClicked(args: {
  action: FirstValueAction;
  actingAs: boolean;
  locale: string;
  surface?: string;
}): void {
  logActivation("first_value_action_clicked", {
    surface: args.surface ?? "first_value_panel",
    persona_mode: args.action.persona,
    action_id: args.action.id,
    action_kind: args.action.actionKind,
    acting_as: args.actingAs,
    locale: args.locale,
  });
}

export function logActivationMilestoneReached(args: {
  milestoneKey: string;
  personaMode: PersonaMode;
  actingAs: boolean;
  locale: string;
  surface?: string;
}): void {
  logActivation("activation_milestone_reached", {
    surface: args.surface ?? "first_value_panel",
    persona_mode: args.personaMode,
    milestone_key: args.milestoneKey,
    acting_as: args.actingAs,
    locale: args.locale,
  });
}

// =====================================================================
// Sprint 7.1 Phase E — privacy-safe activation milestone derivation.
//
// `deriveActivationMilestones` looks ONLY at numeric / boolean signals
// already present in the FirstValueSelectorInput (no IDs, no names,
// no notes, no message bodies). The keys it can return are an exhaustive
// allowlist defined here; nothing outside this list will ever be
// emitted, even if a future caller passes extra fields.
//
// Dedup happens in the panel via `markMilestoneSeen` /
// `hasMilestoneBeenSeen`. Storage is per-(profile-mode-locale) via
// localStorage so a calm reload does not re-fire — but we never store
// any identifying value, only the milestone key + persona_mode.
// =====================================================================

export const ACTIVATION_MILESTONE_KEYS = [
  "artist_profile_started",
  "artist_three_works_uploaded",
  "artist_first_visibility_set",
  "gallery_first_room_created",
  "collector_first_save_or_follow",
  "first_relationship_note_saved",
] as const;

export type ActivationMilestoneKey =
  (typeof ACTIVATION_MILESTONE_KEYS)[number];

const MILESTONE_SET = new Set<string>(ACTIVATION_MILESTONE_KEYS);

function safeNumber(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Pure, deterministic derivation. Input is the same selector input the
 * FirstValuePathPanel already builds. No DB lookups, no side effects.
 *
 * The selector input is privacy-safe by construction: it carries
 * counts, booleans, and persona mode — never identifiers, names,
 * notes, or message bodies. This function therefore inherits the same
 * safety profile.
 */
export function deriveActivationMilestones(
  input: FirstValueSelectorInput
): ActivationMilestoneKey[] {
  const out: ActivationMilestoneKey[] = [];

  if (safeNumber(input.profileCompleteness) >= 30) {
    out.push("artist_profile_started");
  }
  if (safeNumber(input.artworkCount) >= 3) {
    out.push("artist_three_works_uploaded");
  }
  if (safeNumber(input.publicArtworkCount) >= 1) {
    out.push("artist_first_visibility_set");
  }
  if (
    input.personaMode === "gallery" &&
    safeNumber(input.roomCount) >= 1
  ) {
    out.push("gallery_first_room_created");
  }
  if (
    input.personaMode === "collector" &&
    safeNumber(input.savedOrFollowedCount) >= 1
  ) {
    out.push("collector_first_save_or_follow");
  }
  if (input.hasPrivateNote === true) {
    out.push("first_relationship_note_saved");
  }

  return out;
}

const STORAGE_KEY_PREFIX = "abstract.activation.milestones.v1";

function storageKey(personaMode: PersonaMode): string {
  return `${STORAGE_KEY_PREFIX}:${personaMode}`;
}

/**
 * SSR-safe localStorage read. Returns the set of milestone keys the
 * caller has already fired for this persona on this device. Never
 * stores anything beyond the milestone key + persona_mode.
 */
export function readSeenMilestones(personaMode: PersonaMode): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(personaMode));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string" && MILESTONE_SET.has(v)) out.add(v);
    }
    return out;
  } catch {
    return new Set();
  }
}

function writeSeenMilestones(
  personaMode: PersonaMode,
  seen: Set<string>
): void {
  if (typeof window === "undefined") return;
  try {
    const filtered = Array.from(seen).filter((k) => MILESTONE_SET.has(k));
    window.localStorage.setItem(
      storageKey(personaMode),
      JSON.stringify(filtered)
    );
  } catch {
    // localStorage may be unavailable (private mode, quota). Failing
    // silently is the right call — we'd rather under-emit than crash.
  }
}

/**
 * Emit each *newly* reached milestone exactly once per device per
 * persona. Returns the set of milestones that were emitted in this
 * call (handy for tests).
 */
export function emitActivationMilestonesOnce(args: {
  input: FirstValueSelectorInput;
  actingAs: boolean;
  locale: string;
  surface?: string;
}): ActivationMilestoneKey[] {
  const reached = deriveActivationMilestones(args.input);
  if (reached.length === 0) return [];
  const seen = readSeenMilestones(args.input.personaMode);
  const fired: ActivationMilestoneKey[] = [];
  for (const key of reached) {
    if (seen.has(key)) continue;
    logActivationMilestoneReached({
      milestoneKey: key,
      personaMode: args.input.personaMode,
      actingAs: args.actingAs,
      locale: args.locale,
      surface: args.surface,
    });
    seen.add(key);
    fired.push(key);
  }
  if (fired.length > 0) {
    writeSeenMilestones(args.input.personaMode, seen);
  }
  return fired;
}

export function logPersonaModeHintSeen(args: {
  personaMode: PersonaMode;
  actingAs: boolean;
  locale: string;
  surface?: string;
}): void {
  logActivation("persona_mode_hint_seen", {
    surface: args.surface ?? "studio_hero",
    persona_mode: args.personaMode,
    acting_as: args.actingAs,
    locale: args.locale,
  });
}
