import { supabase } from "./client";

export type DelegationScopeType = "account" | "project" | "inventory";

export type DelegationStatus = "pending" | "active" | "revoked";

export type DelegationRow = {
  id: string;
  delegator_profile_id: string;
  delegate_profile_id: string | null;
  delegate_email: string;
  scope_type: DelegationScopeType;
  project_id: string | null;
  permissions: string[];
  invite_token: string;
  status: DelegationStatus;
  created_at: string;
  updated_at: string;
};

export type DelegationWithDetails = DelegationRow & {
  delegator_profile?: { id: string; username: string | null; display_name: string | null } | null;
  project?: { id: string; title: string } | null;
  delegate_profile?: { id: string; username: string | null; display_name: string | null } | null;
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

/** Create a delegation invite; returns invite_token for the email link. */
export async function createDelegationInvite(args: {
  delegateEmail: string;
  scopeType: DelegationScopeType;
  projectId?: string | null;
  permissions?: string[];
}): Promise<{ data: { id: string; invite_token: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("create_delegation_invite", {
    p_delegate_email: args.delegateEmail.trim().toLowerCase(),
    p_scope_type: args.scopeType,
    p_project_id: args.projectId ?? null,
    p_permissions: args.permissions ?? ["view", "edit_metadata", "manage_works"],
  });
  if (error) return { data: null, error };
  const raw = data as { id: string; invite_token: string } | null;
  return { data: raw, error: null };
}

/** Get delegation by invite token (for landing page; only pending, safe fields). */
export async function getDelegationByToken(
  token: string
): Promise<{ data: GetDelegationByTokenResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc("get_delegation_by_token", {
    p_token: token,
  });
  if (error) return { data: null, error };
  return { data: data as GetDelegationByTokenResult, error: null };
}

/** Accept a delegation (caller must be logged in; session email must match delegate_email). */
export async function acceptDelegationByToken(
  token: string
): Promise<{ data: { ok: boolean; reason?: string; id?: string } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("accept_delegation_by_token", {
    p_token: token,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean; reason?: string; id?: string }, error: null };
}

/** Revoke a delegation (delegator only). */
export async function revokeDelegation(
  delegationId: string
): Promise<{ data: { ok: boolean } | null; error: unknown }> {
  const { data, error } = await supabase.rpc("revoke_delegation", {
    p_delegation_id: delegationId,
  });
  if (error) return { data: null, error };
  return { data: data as { ok: boolean }, error: null };
}

/** List delegations for current user (sent and received). */
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
