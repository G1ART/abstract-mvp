-- Delegation Final Hardening — PR-A · account-scope permission-aware helpers.
--
-- Adds `auth.uid()`-anchored helpers that wrap permission membership checks
-- against an active account delegation. These complement (do not replace)
-- the existing `is_account_delegate_of(owner)` and the explicit
-- `has_account_delegate_permission(owner, delegate, perm)` helpers from
-- 20260503000200_delegation_permission_helpers.sql.
--
-- Why a new shape:
--   The original helpers either ignored permissions entirely
--   (`is_account_delegate_of`) or required passing `auth.uid()` explicitly
--   from RLS bodies. Wiring those into every existing policy would balloon
--   policy bodies. The variants below take a single `p_owner` argument
--   and check `auth.uid()` internally, which keeps RLS bodies short.
--
-- Behaviour:
--   `has_active_account_delegate_perm(owner, perm)`
--     → true iff the current session user holds an ACTIVE account-scope
--       delegation against `owner` AND `perm` is a member of the
--       delegation's `permissions[]`.
--   `is_active_account_delegate_writer(owner)`
--     → true iff the current session user holds an ACTIVE account-scope
--       delegation against `owner` AND that delegation grants AT LEAST
--       one mutating permission (anything other than `view`). This is the
--       single helper used by all account-scope WRITE policies in
--       20260505000100; per-table specificity is still possible by using
--       `has_active_account_delegate_perm(owner, '<perm>')` directly.
--
-- All helpers are SECURITY DEFINER so they can read `public.delegations`
-- regardless of the caller's RLS, and STABLE so the planner can hoist
-- them. They are SAFE to re-run; bodies use `create or replace`.

begin;

create or replace function public.has_active_account_delegate_perm(
  p_owner_profile_id uuid,
  p_permission       text
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
       and d.scope_type           = 'account'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
       and p_permission           = any(d.permissions)
  );
$$;

create or replace function public.is_active_account_delegate_writer(
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
       and d.scope_type           = 'account'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
       -- "writer" = holds at least one non-view permission.
       and exists (
         select 1 from unnest(d.permissions) p
          where p <> 'view'
       )
  );
$$;

grant execute on function public.has_active_account_delegate_perm(uuid, text)
  to authenticated;
grant execute on function public.is_active_account_delegate_writer(uuid)
  to authenticated;

commit;
