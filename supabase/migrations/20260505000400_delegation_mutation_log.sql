-- Delegation Final Hardening — PR-C · Delegated mutation activity logs.
--
-- Adds a security-definer RPC the client can call after a successful
-- mutation made on behalf of another profile (acting-as). The RPC
-- looks up the most recent active delegation between the caller and
-- the target owner and writes a row into `delegation_activity_events`
-- so the delegator's audit trail captures the WHAT (not just the
-- "you started acting-as" boundary captured by `acting_context_events`).
--
-- Why a separate write path:
--   `delegation_activity_events` is the surface the delegator sees in
--   the detail drawer. Auto-populating it from existing client write
--   sites avoids forcing every callsite to re-derive the delegation_id
--   themselves and lets us tie the row strictly to active delegations
--   (so revoked/expired ones don't continue to accumulate noise).
--
-- Permission model:
--   security definer; only callable by an authenticated user who
--   actually has an active delegation against `p_owner_profile_id`.
--   No-op when the caller is the owner (then it's a regular self-edit
--   and there's no delegation to log against).
--
-- Best-effort:
--   This is a fire-and-forget audit hook. Callers swallow errors.
--   A failed insert must never block the actual mutation that just
--   succeeded.

begin;

create or replace function public.record_delegated_mutation(
  p_owner_profile_id uuid,
  p_event_type       text,
  p_target_type      text default null,
  p_target_id        uuid default null,
  p_summary          text default null,
  p_metadata         jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_d   record;
begin
  if v_uid is null then return; end if;
  if p_owner_profile_id is null then return; end if;
  if v_uid = p_owner_profile_id then return; end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then return; end if;

  select d.id, d.scope_type, d.project_id
    into v_d
    from public.delegations d
   where d.delegator_profile_id = p_owner_profile_id
     and d.delegate_profile_id  = v_uid
     and d.status               = 'active'::public.delegation_status_type
   order by d.accepted_at desc nulls last, d.created_at desc
   limit 1;

  if not found then return; end if;

  insert into public.delegation_activity_events (
    delegation_id, actor_profile_id, owner_profile_id, scope_type,
    project_id, event_type, target_type, target_id, summary, metadata
  ) values (
    v_d.id, v_uid, p_owner_profile_id, v_d.scope_type,
    v_d.project_id, p_event_type, p_target_type, p_target_id, p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.record_delegated_mutation(
  uuid, text, text, uuid, text, jsonb
) to authenticated;

commit;
