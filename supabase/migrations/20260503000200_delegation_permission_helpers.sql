-- Delegation upgrade phase 1: permission helper functions.
--
-- Adds named SQL functions for the delegation permission checks that are
-- currently inlined as EXISTS subqueries inside RLS policies and the
-- account-scope is_account_delegate_of helper.
--
-- These are ADDITIVE — existing policies and helpers are NOT altered.
-- New code paths can use the named helpers; policy bodies will be migrated
-- incrementally in a future patch.

-- 1) is_active_account_delegate(owner, delegate)
create or replace function public.is_active_account_delegate(
  p_owner_profile_id    uuid,
  p_delegate_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = p_owner_profile_id
       and d.delegate_profile_id  = p_delegate_profile_id
       and d.scope_type           = 'account'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
  );
$$;

-- 2) is_active_project_delegate(project_id, delegate)
create or replace function public.is_active_project_delegate(
  p_project_id          uuid,
  p_delegate_profile_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
     where d.project_id           = p_project_id
       and d.delegate_profile_id  = p_delegate_profile_id
       and d.scope_type           = 'project'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
  );
$$;

-- 3) has_account_delegate_permission(owner, delegate, perm)
create or replace function public.has_account_delegate_permission(
  p_owner_profile_id    uuid,
  p_delegate_profile_id uuid,
  p_permission          text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = p_owner_profile_id
       and d.delegate_profile_id  = p_delegate_profile_id
       and d.scope_type           = 'account'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
       and p_permission = any(d.permissions)
  );
$$;

-- 4) has_project_delegate_permission(project_id, delegate, perm)
create or replace function public.has_project_delegate_permission(
  p_project_id          uuid,
  p_delegate_profile_id uuid,
  p_permission          text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.delegations d
     where d.project_id           = p_project_id
       and d.delegate_profile_id  = p_delegate_profile_id
       and d.scope_type           = 'project'::public.delegation_scope_type
       and d.status               = 'active'::public.delegation_status_type
       and p_permission = any(d.permissions)
  );
$$;

grant execute on function public.is_active_account_delegate(uuid, uuid)
  to authenticated;
grant execute on function public.is_active_project_delegate(uuid, uuid)
  to authenticated;
grant execute on function public.has_account_delegate_permission(uuid, uuid, text)
  to authenticated;
grant execute on function public.has_project_delegate_permission(uuid, uuid, text)
  to authenticated;
