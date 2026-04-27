import { supabase } from "./client";

export type DelegationScopeType = "account" | "project" | "inventory";

export type DelegationStatus =
  | "pending"
  | "active"
  | "revoked"
  | "declined"
  | "expired";

export type DelegationPreset =
  | "operations"
  | "content"
  | "review"
  | "project_co_edit"
  | "project_works_only"
  | "project_review";

export const ACCOUNT_PRESETS: DelegationPreset[] = ["operations", "content", "review"];
export const PROJECT_PRESETS: DelegationPreset[] = [
  "project_co_edit",
  "project_works_only",
  "project_review",
];

export type DelegationRow = {
  id: string;
  delegator_profile_id: string;
  delegate_profile_id: string | null;
  delegate_email: string;
  scope_type: DelegationScopeType;
  project_id: string | null;
  permissions: string[];
  preset: DelegationPreset | null;
  note: string | null;
  invite_token?: string;
  status: DelegationStatus;
  invited_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DelegationParticipant = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export type DelegationProjectInfo = {
  id: string;
  title: string;
};

export type DelegationWithDetails = DelegationRow & {
  delegator_profile?: DelegationParticipant | null;
  project?: DelegationProjectInfo | null;
  delegate_profile?: DelegationParticipant | null;
};

export type ListMyDelegationsResult = {
  sent: DelegationWithDetails[];
  received: DelegationWithDetails[];
};

export type GetDelegationByTokenResult = {
  found: boolean;
  id?: string;
  delegate_email?: string;
  scope_type?: DelegationScopeType;
  status?: string;
  delegator?: { id: string; username: string | null; display_name: string | null };
  project?: { id: string; title: string } | null;
};

export type DelegationActivityEvent = {
  id: string;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  actor_profile_id: string | null;
  created_at: string;
};

export type DelegationDetail = {
  ok: true;
  delegation: DelegationRow;
  delegator_profile: DelegationParticipant | null;
  delegate_profile: DelegationParticipant | null;
  project: DelegationProjectInfo | null;
  events: DelegationActivityEvent[];
};

export type DelegationDetailError = {
  ok: false;
  code: "permission_denied" | "not_found" | string;
};

const DEFAULT_PERMISSIONS = ["view", "edit_metadata", "manage_works"];

/** Create a delegation invite (email-based); returns invite_token. */
export async function createDelegationInvite(args: {
  delegateEmail: string;
  scopeType: DelegationScopeType;
  projectId?: string | null;
  permissions?: string[];
  preset?: DelegationPreset | null;
  note?: string | null;
}): Promise<{ data: { id: string; invite_token: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("create_delegation_invite", {
    p_delegate_email: args.delegateEmail.trim().toLowerCase(),
    p_scope_type: args.scopeType,
    p_project_id: args.projectId ?? null,
    p_permissions: args.preset ? null : args.permissions ?? DEFAULT_PERMISSIONS,
    p_preset: args.preset ?? null,
    p_note: args.note ?? null,
  });
  if (error) return { data: null, error };
  return { data: data as { id: string; invite_token: string } | null, error: null };
}

/** Invite an existing user by profile (in-app accept). */
export async function createDelegationInviteForProfile(args: {
  delegateProfileId: string;
  scopeType: DelegationScopeType;
  projectId?: string | null;
  permissions?: string[];
  preset?: DelegationPreset | null;
  note?: string | null;
}): Promise<{ data: { id: string; invite_token: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("create_delegation_invite_for_profile", {
    p_delegate_profile_id: args.delegateProfileId,
    p_scope_type: args.scopeType,
    p_project_id: args.projectId ?? null,
    p_permissions: args.preset ? null : args.permissions ?? DEFAULT_PERMISSIONS,
    p_preset: args.preset ?? null,
    p_note: args.note ?? null,
  });
  if (error) return { data: null, error };
  return { data: data as { id: string; invite_token: string } | null, error: null };
}

export async function getDelegationByToken(
  token: string
): Promise<{ data: GetDelegationByTokenResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc("get_delegation_by_token", {
    p_token: token,
  });
  if (error) return { data: null, error };
  return { data: data as GetDelegationByTokenResult, error: null };
}

export async function acceptDelegationByToken(
  token: string
): Promise<{ data: { ok: boolean; reason?: string; code?: string; id?: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("accept_delegation_by_token", {
    p_token: token,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean; reason?: string; code?: string; id?: string }, error: null };
}

export async function revokeDelegation(
  delegationId: string
): Promise<{ data: { ok: boolean; code?: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("revoke_delegation", {
    p_delegation_id: delegationId,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean; code?: string }, error: null };
}

export async function acceptDelegationById(
  delegationId: string
): Promise<{ data: { ok: boolean; reason?: string; code?: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("accept_delegation_by_id", {
    p_delegation_id: delegationId,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean; reason?: string; code?: string }, error: null };
}

export async function declineDelegationById(
  delegationId: string
): Promise<{ data: { ok: boolean; reason?: string; code?: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("decline_delegation_by_id", {
    p_delegation_id: delegationId,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean; reason?: string; code?: string }, error: null };
}

export async function listMyDelegations(): Promise<{
  data: ListMyDelegationsResult | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc("list_my_delegations");
  if (error) return { data: null, error };
  const raw = data as { sent: DelegationWithDetails[]; received: DelegationWithDetails[] };
  return {
    data: {
      sent: Array.isArray(raw?.sent) ? raw.sent : [],
      received: Array.isArray(raw?.received) ? raw.received : [],
    },
    error: null,
  };
}

/** Fetch a delegation detail bundle (delegation + parties + project + events). */
export async function getDelegationDetail(
  delegationId: string
): Promise<{ data: DelegationDetail | null; error: unknown }> {
  const { data, error } = await supabase.rpc("get_delegation_detail", {
    p_delegation_id: delegationId,
  });
  if (error) return { data: null, error };
  const raw = data as DelegationDetail | DelegationDetailError | null;
  if (!raw || !("ok" in raw)) return { data: null, error: new Error("invalid_response") };
  if (raw.ok === false) return { data: null, error: new Error(raw.code || "unknown") };
  return { data: raw, error: null };
}

/** Permission lists per preset (single source of truth, kept in sync with
 *  public.delegation_preset_permissions). UI uses this to render allow/deny
 *  bullets; security still flows through the SQL function on the server. */
export const PRESET_PERMISSIONS: Record<DelegationPreset, string[]> = {
  operations: [
    "view",
    "edit_metadata",
    "manage_works",
    "manage_artworks",
    "manage_exhibitions",
    "manage_inquiries",
    "manage_claims",
  ],
  content: [
    "view",
    "edit_metadata",
    "manage_works",
    "manage_artworks",
    "manage_exhibitions",
    "edit_profile_public_content",
  ],
  review: ["view"],
  project_co_edit: ["view", "edit_metadata", "manage_works"],
  project_works_only: ["view", "manage_works"],
  project_review: ["view"],
};

export function presetForScope(scope: DelegationScopeType, preset: DelegationPreset): boolean {
  if (scope === "account") return ACCOUNT_PRESETS.includes(preset);
  if (scope === "project") return PROJECT_PRESETS.includes(preset);
  return false;
}
