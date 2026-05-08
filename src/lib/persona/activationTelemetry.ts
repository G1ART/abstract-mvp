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
