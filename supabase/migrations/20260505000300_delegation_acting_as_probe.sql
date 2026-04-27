-- Delegation Final Hardening — PR-B · acting-as stale-session probe.
--
-- Returns true iff the current session user (`auth.uid()`) holds AT LEAST
-- ONE active delegation (any scope, any preset) against `p_owner`. Used
-- by `ActingAsProvider` to detect when the locally-stored "acting as"
-- target has been revoked (or expired) on the server, and silently
-- clear the misleading banner.
--
-- This is a *read-only liveness probe* — it does NOT validate per-action
-- permissions. RLS is still the source of truth for whether a specific
-- mutation is allowed; this is just for surfacing the "is this banner
-- still meaningful?" signal at the UX layer.

begin;

create or replace function public.is_active_delegate_of(
  p_owner_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = p_owner_profile_id
       and d.delegate_profile_id  = auth.uid()
       and d.status               = 'active'::public.delegation_status_type
  );
$$;

grant execute on function public.is_active_delegate_of(uuid)
  to authenticated;

commit;
