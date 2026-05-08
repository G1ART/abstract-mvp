// Sprint 7 Phase 0.2 — narrow access-grant lifecycle adapter.
//
// `resolveAccessRequestV2` (see src/lib/supabase/relationshipAccess.ts)
// shipped as an API-ready RPC during Sprint 6 with three optional
// narrowing parameters: subject_type, subject_id, expires_at. Sprint 7
// wires it into the calmest possible v1 UI: four named approval scopes
// rendered as quiet pills inside the AccessRequestsPanel row detail.
//
// This adapter centralizes the scope -> RPC arg mapping so the UI can
// stay declarative and the test surface can pin all four scopes against
// a single contract.
//
// The four scopes (from Sprint 7 work order §2.2 + Addendum §1):
//
//   "all"          → grant the request as-is, no narrowing.
//   "this_work"    → grant only for the artwork the request was filed
//                    against (no-op when the request is profile-wide
//                    AND has no subject_id; in that case we degrade
//                    to "all" rather than crash).
//   "thirty_days"  → grant for 30 days from now, otherwise as-is.
//   "decline"      → decline the request.
//
// No scope ever surfaces principal IDs or message bodies in telemetry.

import type { AccessRequest } from "@/lib/visibility/types";
import { resolveAccessRequestV2 } from "@/lib/supabase/relationshipAccess";

export const ACCESS_GRANT_SCOPES = [
  "all",
  "this_work",
  "thirty_days",
  "decline",
] as const;

export type AccessGrantScope = (typeof ACCESS_GRANT_SCOPES)[number];

export type ResolveWithScopeArgs = {
  request: Pick<AccessRequest, "id" | "subject_type" | "subject_id">;
  scope: AccessGrantScope;
};

export type ResolveWithScopeResult = {
  data: AccessRequest | null;
  error: Error | null;
};

function thirtyDaysFromNowISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

export async function resolveAccessRequestWithScope(
  args: ResolveWithScopeArgs
): Promise<ResolveWithScopeResult> {
  const { request, scope } = args;

  if (scope === "decline") {
    return resolveAccessRequestV2({
      requestId: request.id,
      action: "decline",
    });
  }

  if (scope === "this_work") {
    if (request.subject_type === "artwork" && request.subject_id) {
      return resolveAccessRequestV2({
        requestId: request.id,
        action: "approve",
        grantSubjectType: "artwork",
        grantSubjectId: request.subject_id,
      });
    }
    return resolveAccessRequestV2({
      requestId: request.id,
      action: "approve",
    });
  }

  if (scope === "thirty_days") {
    return resolveAccessRequestV2({
      requestId: request.id,
      action: "approve",
      expiresAt: thirtyDaysFromNowISO(),
    });
  }

  return resolveAccessRequestV2({
    requestId: request.id,
    action: "approve",
  });
}
