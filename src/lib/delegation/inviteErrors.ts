/**
 * Map a `create_delegation_invite_for_profile` RPC error to a
 * user-friendly i18n key.
 *
 * The Postgres function uses `raise exception 'message'` for its
 * preconditions (`Cannot invite yourself`, duplicate, missing email,
 * project permission). PostgREST surfaces those messages on the
 * `message`/`details` fields. We sniff for the well-known phrases so
 * the delegations UI can show a SPECIFIC reason instead of the
 * generic "초대를 보내지 못했습니다" toast that QA flagged
 * (Stabilization rows 37, 38 — the user couldn't tell if their click
 * had registered or why the invite failed).
 *
 * Return value:
 *   - i18n key for a known reason, OR
 *   - null when we couldn't classify it (caller should fall back to
 *     the generic "delegation.inviteToUserFailed" key + log details).
 */
import { formatErrorMessage } from "@/lib/errors/format";

export function classifyDelegationInviteError(error: unknown): {
  key: string;
  raw: string;
} {
  const raw = formatErrorMessage(error);
  const lower = raw.toLowerCase();

  if (lower.includes("cannot invite yourself")) {
    return { key: "delegation.inviteFailedSelf", raw };
  }
  if (
    lower.includes("invitation or delegation already exists") ||
    lower.includes("already exists for this user")
  ) {
    return { key: "delegation.inviteFailedDuplicate", raw };
  }
  if (lower.includes("delegate user has no email")) {
    return { key: "delegation.inviteFailedNoEmail", raw };
  }
  if (lower.includes("not allowed to delegate this project")) {
    return { key: "delegation.inviteFailedNotAllowed", raw };
  }
  return { key: "delegation.inviteToUserFailed", raw };
}
