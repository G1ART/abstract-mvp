/**
 * Map a delegation-invite-style RPC error to a user-friendly i18n key.
 *
 * As of phase-1 of the delegation upgrade (2026-04-27), backend RPCs raise
 * stable lowercase code keywords as the exception MESSAGE field
 * (e.g. `cannot_invite_self`, `duplicate_pending_invite`). We match those
 * codes first; for backwards compatibility with older deployments that
 * still use English sentences (e.g. `Cannot invite yourself`), the legacy
 * substring matcher is preserved as a fallback.
 *
 * Return value:
 *   - { key: i18n key, raw: original message }
 */
import { formatErrorMessage } from "@/lib/errors/format";

const CODE_TO_KEY: Record<string, string> = {
  cannot_invite_self: "delegation.error.cannot_invite_self",
  duplicate_pending_invite: "delegation.error.duplicate_pending_invite",
  already_active: "delegation.error.already_active",
  delegate_not_found: "delegation.error.delegate_not_found",
  project_not_found: "delegation.error.project_not_found",
  permission_denied: "delegation.error.permission_denied",
  invalid_scope: "delegation.error.invalid_scope",
  missing_email: "delegation.error.missing_email",
  email_send_failed: "delegation.error.email_send_failed",
  unknown: "delegation.error.unknown",
};

const LEGACY_KEYS = {
  self: "delegation.inviteFailedSelf",
  duplicate: "delegation.inviteFailedDuplicate",
  noEmail: "delegation.inviteFailedNoEmail",
  notAllowed: "delegation.inviteFailedNotAllowed",
  generic: "delegation.inviteToUserFailed",
} as const;

export function classifyDelegationInviteError(error: unknown): {
  key: string;
  raw: string;
} {
  const raw = formatErrorMessage(error);
  const trimmed = raw.trim().toLowerCase();

  for (const code of Object.keys(CODE_TO_KEY)) {
    if (trimmed === code || trimmed.startsWith(`${code} `) || trimmed.startsWith(`${code}:`)) {
      return { key: CODE_TO_KEY[code], raw };
    }
  }

  if (trimmed.includes("cannot invite yourself") || trimmed.includes("cannot_invite_self")) {
    return { key: LEGACY_KEYS.self, raw };
  }
  if (
    trimmed.includes("invitation or delegation already exists") ||
    trimmed.includes("already exists for this user") ||
    trimmed.includes("duplicate_pending_invite")
  ) {
    return { key: LEGACY_KEYS.duplicate, raw };
  }
  if (
    trimmed.includes("delegate user has no email") ||
    trimmed.includes("delegate_not_found")
  ) {
    return { key: LEGACY_KEYS.noEmail, raw };
  }
  if (
    trimmed.includes("not allowed to delegate this project") ||
    trimmed.includes("project_not_found")
  ) {
    return { key: LEGACY_KEYS.notAllowed, raw };
  }
  return { key: LEGACY_KEYS.generic, raw };
}
