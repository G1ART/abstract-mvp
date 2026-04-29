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
-- ===========================================================================
--  HOW TO APPLY (Supabase Dashboard SQL editor)
-- ===========================================================================
-- Earlier attempts pasting the entire file failed with
--   ERROR: 42P01: relation "v_email" does not exist
-- because the dashboard's SQL tokenizer sometimes splits multi-block
-- migrations on a stray `;` *inside* a dollar-quoted PL/pgSQL body —
-- the function body then leaks out as top-level SQL where local
-- variables look like missing relations.
--
-- The reliable fix is to run the four sections below ONE AT A TIME.
-- Each section is bounded by a banner header (== SECTION N == ...)
-- and is independently idempotent. Highlight a single section,
-- click "Run", confirm it succeeded, then move on to the next.
-- ===========================================================================


-- ===========================================================================
-- == SECTION 1 == handle_profile_created_link_delegations + trigger swap
-- ===========================================================================
-- Body uses expression assignment (`:=`) instead of `SELECT … INTO …`
-- wherever possible. This way, even if the editor mis-splits the
-- function body, the resulting top-level statement fails with a
-- syntax error on the assignment operator instead of a misleading
-- "relation does not exist" — making it instantly obvious that the
-- editor truncated the function body. The record-typed lookup for
-- v_d still uses SELECT INTO because record assignment from a
-- multi-column select needs the PL/pgSQL form.

create or replace function public.handle_profile_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $a$
declare
  v_email           text;
  v_id              uuid;
  v_now             timestamptz := now();
  v_delegator       uuid;
  v_scope           text;
  v_project_id      uuid;
  v_preset          text;
  v_project_title   text;
begin
  v_email := (select au.email from auth.users au where au.id = new.id limit 1);
  if v_email is null or v_email = '' then
    return new;
  end if;

  for v_id in
    select id from public.delegations
     where lower(trim(delegate_email)) = lower(trim(v_email))
       and status = 'pending'
       and delegate_profile_id is null
  loop
    update public.delegations
       set delegate_profile_id = new.id,
           updated_at          = v_now
     where id = v_id;

    v_delegator  := (select delegator_profile_id from public.delegations where id = v_id);
    v_scope      := (select scope_type::text     from public.delegations where id = v_id);
    v_project_id := (select project_id           from public.delegations where id = v_id);
    v_preset     := (select preset               from public.delegations where id = v_id);

    v_project_title := null;
    if v_project_id is not null then
      v_project_title := (select title from public.projects where id = v_project_id);
    end if;

    insert into public.delegation_activity_events (
      delegation_id, actor_profile_id, owner_profile_id, scope_type,
      project_id, event_type, summary, metadata
    )
    values (
      v_id, new.id, v_delegator, v_scope::public.delegation_scope_type, v_project_id,
      'invite_linked_at_signup',
      'Invite linked to new signup; awaiting explicit accept',
      jsonb_build_object('via', 'auth_signup')
    );

    perform public._record_delegation_notification(
      new.id,
      'delegation_invite_received',
      v_delegator,
      jsonb_build_object(
        'delegation_id', v_id,
        'scope_type',    v_scope,
        'project_id',    v_project_id,
        'project_title', v_project_title,
        'preset',        v_preset,
        'via',           'auth_signup'
      )
    );
  end loop;
  return new;
end;
$a$;

drop trigger if exists on_auth_user_created_link_delegations on auth.users;
drop trigger if exists on_profile_created_link_delegations  on public.profiles;
create trigger on_profile_created_link_delegations
  after insert on public.profiles
  for each row execute function public.handle_profile_created_link_delegations();


-- ===========================================================================
-- == SECTION 2 == accept_follow_request — also clears the follow_request
-- ==              notification row so the principal's inbox stays in sync.
-- ===========================================================================
create or replace function public.accept_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $b$
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
$b$;

grant execute on function public.accept_follow_request(uuid) to authenticated;


-- ===========================================================================
-- == SECTION 3 == decline_follow_request — same cleanup pattern.
-- ===========================================================================
create or replace function public.decline_follow_request(p_follower uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $c$
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
$c$;

grant execute on function public.decline_follow_request(uuid) to authenticated;


-- ===========================================================================
-- == SECTION 4 == is_public false → true: auto-accept all pending follow
-- ==              requests targeting that profile + clean up follow_request
-- ==              notifications. on_follow_accept_notify (the UPDATE
-- ==              trigger registered in 20260511000000) will fire for each
-- ==              flipped row and emit follow_request_accepted (→ follower)
-- ==              + follow (→ principal) notifications.
-- ==
-- ==              true → false (going PRIVATE) is intentionally a no-op:
-- ==              existing accepted followers stay accepted; downgrading
-- ==              them would silently revoke read access to a graph the
-- ==              principal already vouched for.
-- ===========================================================================
create or replace function public.handle_profile_visibility_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $d$
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
$d$;

drop trigger if exists on_profile_visibility_opened on public.profiles;
create trigger on_profile_visibility_opened
  after update of is_public on public.profiles
  for each row execute function public.handle_profile_visibility_opened();
