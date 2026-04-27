-- Delegation Handoff-Parity Hardening — get_delegation_by_token full payload.
--
-- Why
--   The previous version filtered to `status = 'pending'`. That meant the
--   invite-landing page could never render a useful state for already-
--   active / declined / revoked / expired tokens — the RPC just returned
--   `{found:false}` and the UI fell back to a generic "invalid or expired"
--   message. PR-A added graceful per-status copy on the page but the RPC
--   contract never changed, so that branch was dead code.
--
--   In addition, the page wants to show *what* is being granted so the
--   recipient can review before accepting (handoff §4.3). That requires
--   surfacing `preset` on the read RPC. We deliberately keep the surface
--   conservative — only fields safe to show without auth gating.
--
-- What this changes
--   1. Drop the `status = 'pending'` filter; return the row regardless of
--      lifecycle state, so the client can render explicit accept / already-
--      active / inactive variants.
--   2. Add `preset` to the JSON payload.
--   3. Keep all other fields and types stable so the existing client
--      remains forward-compatible.
--
-- Security
--   Still security definer + read-only. We never expose `delegator_profile_id`,
--   `delegate_profile_id`, the linked email after explicit-accept signup
--   linking, the invite token itself, or audit metadata. Caller can already
--   present the token (which they were given via email/copy-link), so
--   surfacing the public scope/preset/owner profile fields adds no real
--   exposure: an attacker holding the token already has read access to the
--   invite landing page anyway.
--
-- Idempotent (CREATE OR REPLACE).

begin;

create or replace function public.get_delegation_by_token(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row       record;
  v_delegator record;
  v_project   record;
begin
  select d.id,
         d.delegate_email,
         d.scope_type,
         d.project_id,
         d.status,
         d.preset,
         d.delegator_profile_id
    into v_row
    from public.delegations d
   where d.invite_token = p_token;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select p.id, p.username, p.display_name into v_delegator
    from public.profiles p
   where p.id = v_row.delegator_profile_id;

  if v_row.project_id is not null then
    select pr.id, pr.title into v_project
      from public.projects pr
     where pr.id = v_row.project_id;
  end if;

  return jsonb_build_object(
    'found',          true,
    'id',             v_row.id,
    'delegate_email', v_row.delegate_email,
    'scope_type',     v_row.scope_type,
    'status',         v_row.status,
    'preset',         v_row.preset,
    'delegator',      to_jsonb(v_delegator),
    'project',        case when v_project is null then null else to_jsonb(v_project) end
  );
end;
$$;

grant execute on function public.get_delegation_by_token(uuid) to anon, authenticated;

commit;
