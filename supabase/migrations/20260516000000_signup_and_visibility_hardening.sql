-- Signup + Visibility Hardening — QA Beta wave (2026-04-29)
--
-- Three independent root-cause fixes that share the same root: edges
-- between auth.users / public.profiles / public.follows / public.delegations
-- weren't aligned with the actual application bootstrap sequence, which
-- in this codebase is:
--
--   1. supabase auth.signUp()                          (auth.users insert)
--   2. client redirects to onboarding / first authed page
--   3. that page calls a client-side RPC (ensure_my_profile,
--      upsert_my_profile_identity, etc.) that creates the
--      public.profiles row.
--
-- That ordering invalidates two existing assumptions:
--   • `handle_auth_user_created_link_delegations` ran on auth.users
--     INSERT, but its body UPDATEs `delegations.delegate_profile_id`
--     which has a FK → public.profiles(id). At that moment profiles
--     hasn't been created yet, so the UPDATE violates the FK and
--     aborts the entire signup transaction with "Database error
--     saving new user". General signups happen to slip through (zero
--     matching delegations rows ⇒ no FK check), but anyone whose
--     email matches a pending invite gets locked out of registration.
--
--   • accept_follow_request / decline_follow_request flipped /
--     deleted the follows row but did NOT delete the corresponding
--     `follow_request` notification row, so the principal's inbox
--     kept showing an unprocessed-looking entry even after a
--     successful accept/decline (and the [수락] / [거절] inline
--     buttons would re-render on every refresh). UX read this as
--     "the buttons don't work".
--
--   • Switching is_public false → true did nothing to in-flight
--     pending follow requests. The visitors' requests stayed pending,
--     the principal kept seeing the same actionable notifications,
--     yet from the visitor's perspective the target is now public
--     and a "request" is no longer the right model.
--
-- Fixes are bundled in this single migration so they can be applied
-- together in the dashboard. None of them touches the schema (only
-- functions + triggers + a couple of policy-irrelevant DELETEs), so
-- this is safe to apply on production with no downtime.
--
-- IMPORTANT — running in the Supabase Dashboard SQL editor:
-- multiple `$$ ... $$` blocks inside a single transaction confuse the
-- editor's statement splitter (we hit this on PR-B). To work around
-- that we
--   • do NOT wrap in BEGIN/COMMIT (each CREATE OR REPLACE is
--     individually idempotent), and
--   • use uniquely-named dollar-tags per function body
--     ($plink$, $accept$, $decline$, $vis$).
--
-- Tag naming caveat: the dashboard editor's tokenizer trips on
-- underscores inside dollar tags (`$p_link$` was originally used here
-- and the first attempt failed with `relation "v_email" does not
-- exist` — i.e. the tokenizer ended the function body too early and
-- the PL/pgSQL `IF v_email IS NULL` ran as a top-level SQL statement
-- where v_email looked like a missing relation). All tags below stick
-- to letters only.

----------------------------------------------------------------------------
-- 1. Move "link pending delegations" trigger from auth.users → public.profiles
----------------------------------------------------------------------------
-- The body is the same as the explicit-accept variant from
-- 20260505000200_delegation_explicit_accept.sql; we just re-host it on
-- a trigger that fires when the profiles row actually exists. We pull
-- the email from auth.users (the join target hasn't moved). Note this
-- still runs on PROFILE creation only — subsequent profile UPDATEs
-- never re-trigger the link, so an existing user can't bind to new
-- invites by editing their profile.

create or replace function public.handle_profile_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $plink$
declare
  v_email           text;
  v_id              uuid;
  v_now             timestamptz := now();
  v_d               record;
  v_project_title   text;
begin
  select au.email into v_email
    from auth.users au
   where au.id = new.id
   limit 1;
  if v_email is null then
    return new;
  end if;

  for v_id in
    select id from public.delegations
     where lower(trim(delegate_email)) = lower(coalesce(trim(v_email), ''))
       and status = 'pending'
       and delegate_profile_id is null
  loop
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
      select title into v_project_title
        from public.projects
       where id = v_d.project_id
       limit 1;
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
$plink$;

-- Detach the legacy auth.users trigger (functioning instance was the
-- one defined in 20260505000200; older variants may still exist on
-- environments that fast-forwarded). Drop both names defensively.
drop trigger if exists on_auth_user_created_link_delegations on auth.users;
drop trigger if exists on_profile_created_link_delegations  on public.profiles;
create trigger on_profile_created_link_delegations
  after insert on public.profiles
  for each row execute function public.handle_profile_created_link_delegations();

----------------------------------------------------------------------------
-- 2. accept_follow_request / decline_follow_request also clean up the
--    pending "follow_request" notification row so the principal's
--    inbox actually reflects the action they just took.
--
--    accept_follow_request flips status pending→accepted; that fires
--    on_follow_accept_notify which inserts the new
--    `follow_request_accepted` (to original requester) +
--    `follow` (to principal) notifications. The original
--    follow_request notification is now stale and should disappear.
--
--    decline_follow_request deletes the follows row outright; the
--    pending follow_request notification likewise becomes stale.
--
--    Both deletes use the (user_id=v_uid AND actor_id=p_follower AND
--    type='follow_request') filter so we only touch the inbox of the
--    person who just acted, and only the row that referenced this
--    specific requester. SECURITY DEFINER bypasses notifications RLS
--    (which currently has no DELETE policy at all).
----------------------------------------------------------------------------

create or replace function public.accept_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $accept$
declare
  v_uid     uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_follower is null then
    raise exception 'invalid follower';
  end if;

  update public.follows
     set status = 'accepted'
   where follower_id  = p_follower
     and following_id = v_uid
     and status       = 'pending';
  get diagnostics v_updated = row_count;

  delete from public.notifications
   where user_id  = v_uid
     and actor_id = p_follower
     and type     = 'follow_request';

  return v_updated > 0;
end;
$accept$;

grant execute on function public.accept_follow_request(uuid) to authenticated;

create or replace function public.decline_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $decline$
declare
  v_uid     uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_follower is null then
    raise exception 'invalid follower';
  end if;

  delete from public.follows
   where follower_id  = p_follower
     and following_id = v_uid
     and status       = 'pending';
  get diagnostics v_deleted = row_count;

  delete from public.notifications
   where user_id  = v_uid
     and actor_id = p_follower
     and type     = 'follow_request';

  return v_deleted > 0;
end;
$decline$;

grant execute on function public.decline_follow_request(uuid) to authenticated;

----------------------------------------------------------------------------
-- 3. profiles.is_public false → true: auto-accept all pending follow
--    requests targeting that profile + clean up the corresponding
--    follow_request notifications. on_follow_accept_notify (the
--    UPDATE trigger registered in 20260511000000) will fire for each
--    flipped row and emit the new follow_request_accepted (→
--    follower) + follow (→ principal) notifications, so the people
--    who waited get a positive resolution and the principal's
--    follower count updates atomically.
--
--    Going the other direction (true → false) is intentionally a
--    no-op: existing accepted followers stay accepted (downgrading
--    them would be surprising and would silently revoke read access
--    to a graph the principal has already vouched for). A future
--    "private re-curate" surface can revisit that.
----------------------------------------------------------------------------

create or replace function public.handle_profile_visibility_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $vis$
begin
  if coalesce(old.is_public, false) = false
     and coalesce(new.is_public, false) = true then
    update public.follows
       set status = 'accepted'
     where following_id = new.id
       and status       = 'pending';

    delete from public.notifications
     where user_id = new.id
       and type    = 'follow_request';
  end if;
  return new;
end;
$vis$;

drop trigger if exists on_profile_visibility_opened on public.profiles;
create trigger on_profile_visibility_opened
  after update of is_public on public.profiles
  for each row execute function public.handle_profile_visibility_opened();
