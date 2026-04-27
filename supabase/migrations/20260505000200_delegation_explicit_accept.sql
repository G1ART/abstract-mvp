-- Delegation Final Hardening — PR-A · Explicit-accept email policy.
--
-- Background:
--   The previous version of `handle_auth_user_created_link_delegations`
--   auto-set `status='active'` + `accepted_at` whenever a new user signed
--   up with an email matching a pending invite. That contradicted both
--   the wording of the SMTP invite email ("...then open the link below
--   to accept") and the dedicated landing page at `/invites/delegation`.
--   The result was a trust-and-clarity gap: a user could be acting as a
--   delegator they had never explicitly agreed to.
--
-- New behaviour:
--   On signup, for every PENDING invite whose `delegate_email` matches
--   the new auth user's email, the trigger now ONLY links the row by
--   filling in `delegate_profile_id`. Status stays `pending`,
--   `accepted_at` stays NULL. The user is then expected to click through
--   the email link (or the My Studio "Delegations" badge) to land on
--   `/invites/delegation?token=…` and confirm.
--
--   We also fire an in-app `delegation_invite_received` notification to
--   the freshly-signed-up user so the invite surfaces immediately in the
--   notification center even if they don't return via the email link.
--
-- Backfill:
--   We INTENTIONALLY do not retroactively flip already-active rows back
--   to pending. Reverting those would surprise users who already saw the
--   delegate appear in their list. New invites going forward will follow
--   explicit-accept semantics.
--
-- Activity event naming:
--   Old auto-accept rows recorded `invite_accepted` with metadata
--   `via=auth_signup`. The new flow records `invite_linked_at_signup`
--   to keep the audit trail clearly distinguishable from a real accept.

begin;

create or replace function public.handle_auth_user_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id              uuid;
  v_now             timestamptz := now();
  v_d               record;
  v_project_title   text;
begin
  for v_id in
    select id from public.delegations
     where lower(trim(delegate_email)) = lower(coalesce(trim(new.email), ''))
       and status = 'pending'
       and delegate_profile_id is null
  loop
    -- Link only. Do NOT activate.
    update public.delegations
       set delegate_profile_id = new.id,
           updated_at          = v_now
     where id = v_id;

    select d.delegator_profile_id, d.scope_type, d.project_id, d.preset
      into v_d
      from public.delegations d
     where d.id = v_id;

    v_project_title := null;
    if v_d.project_id is not null then
      select title into v_project_title from public.projects where id = v_d.project_id;
    end if;

    insert into public.delegation_activity_events (
      delegation_id, actor_profile_id, owner_profile_id, scope_type,
      project_id, event_type, summary, metadata
    )
    values (
      v_id, new.id, v_d.delegator_profile_id, v_d.scope_type, v_d.project_id,
      'invite_linked_at_signup',
      'Invite linked to new signup; awaiting explicit accept',
      jsonb_build_object('via', 'auth_signup')
    );

    -- Surface in the new user's notification center so they can act on it
    -- even if they didn't return via the email link.
    perform public._record_delegation_notification(
      new.id,
      'delegation_invite_received',
      v_d.delegator_profile_id,
      jsonb_build_object(
        'delegation_id', v_id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'project_title', v_project_title,
        'preset',        v_d.preset,
        'via',           'auth_signup'
      )
    );
  end loop;
  return new;
end;
$$;

-- Trigger itself was already created in 20260503000300; keep as-is.

commit;
