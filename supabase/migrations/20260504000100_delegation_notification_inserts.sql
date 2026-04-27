-- Delegation Upgrade Phase 4 (in-app notifications) — lifecycle inserts.
--
-- Re-defines the six delegation lifecycle RPCs and the auth-signup link
-- trigger so that they additionally insert rows into `public.notifications`.
--
--   create_delegation_invite_for_profile → delegate gets `delegation_invite_received`
--   create_delegation_invite (email)     → delegate gets `delegation_invite_received`
--                                          ONLY if their email already maps to an
--                                          onboarded auth user; otherwise the row
--                                          is created at signup (see trigger below)
--   accept_delegation_by_id              → delegator gets `delegation_accepted`
--   accept_delegation_by_token           → delegator gets `delegation_accepted`
--   decline_delegation_by_id             → delegator gets `delegation_declined`
--   revoke_delegation                    → delegate (if profile_id known) gets
--                                          `delegation_revoked`
--   handle_auth_user_created_link_delegations
--                                        → delegator gets `delegation_accepted`
--                                          for every auto-linked row
--
-- All other behaviour (status transitions, activity events, error codes) is
-- preserved exactly. This migration depends on:
--   - 20260503000000_delegations_phase1_schema.sql
--   - 20260503000100_delegations_phase1_rpcs.sql
--   - 20260503000300_delegation_activity_events.sql
--   - 20260504000000_delegation_notification_types.sql
--
-- The notification insert is wrapped in a private helper to keep the
-- lifecycle RPC bodies short and consistent.

begin;

-- ---------------------------------------------------------------------------
-- Internal helper: insert a delegation notification.
-- ---------------------------------------------------------------------------
create or replace function public._record_delegation_notification(
  p_user_id uuid,
  p_type    text,
  p_actor   uuid,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_type is null then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, payload)
  values (p_user_id, p_type, p_actor, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public._record_delegation_notification(uuid, text, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- create_delegation_invite (email-based): notify if email maps to an
-- existing auth user. Otherwise the trigger at signup handles it.
-- ---------------------------------------------------------------------------
create or replace function public.create_delegation_invite(
  p_delegate_email text,
  p_scope_type    public.delegation_scope_type,
  p_project_id    uuid                          default null,
  p_permissions   text[]                        default null,
  p_preset        public.delegation_preset_type default null,
  p_note          text                          default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_email           text;
  v_permissions     text[];
  v_id              uuid;
  v_token           uuid;
  v_now             timestamptz := now();
  v_existing_uid    uuid;
  v_project_title   text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  v_email := nullif(trim(lower(p_delegate_email)), '');
  if v_email is null then
    raise exception 'missing_email' using errcode = 'P0001';
  end if;
  if p_scope_type = 'project' and p_project_id is null then
    raise exception 'invalid_scope' using errcode = 'P0001';
  end if;
  if p_scope_type = 'project' then
    if not exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and (p.curator_id = v_uid or p.host_profile_id = v_uid)
    ) then
      raise exception 'project_not_found' using errcode = 'P0001';
    end if;
  end if;
  if exists (
    select 1 from auth.users u
     where u.id = v_uid and lower(trim(u.email)) = v_email
  ) then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;
  if p_preset is not null then
    if not public.delegation_preset_is_valid_for_scope(p_preset, p_scope_type) then
      raise exception 'invalid_scope' using errcode = 'P0001';
    end if;
    v_permissions := public.delegation_preset_permissions(p_preset);
  else
    v_permissions := coalesce(p_permissions, array['view','edit_metadata','manage_works']);
  end if;
  if exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = v_uid
       and lower(trim(d.delegate_email)) = v_email
       and d.scope_type = p_scope_type
       and (d.project_id is not distinct from p_project_id)
       and d.status in ('pending','active')
  ) then
    raise exception 'duplicate_pending_invite' using errcode = 'P0001';
  end if;

  insert into public.delegations (
    delegator_profile_id, delegate_email, scope_type, project_id,
    permissions, preset, note, status,
    invited_at, invited_by, updated_at
  ) values (
    v_uid, v_email, p_scope_type, p_project_id,
    v_permissions, p_preset, nullif(trim(p_note), ''), 'pending',
    v_now, v_uid, v_now
  )
  returning id, invite_token into v_id, v_token;

  perform public.record_delegation_event(
    v_id, 'invite_created', 'email', null,
    'Invitation sent to ' || v_email,
    jsonb_build_object('preset', p_preset, 'scope', p_scope_type)
  );

  if p_scope_type = 'project' and p_project_id is not null then
    select title into v_project_title from public.projects where id = p_project_id;
  end if;

  -- In-app notification fires only when the invitee already has an account.
  -- Otherwise the signup trigger creates an `delegation_accepted` notif
  -- for the delegator at first login.
  select id into v_existing_uid
    from auth.users
   where lower(trim(email)) = v_email
   limit 1;

  if v_existing_uid is not null then
    perform public._record_delegation_notification(
      v_existing_uid,
      'delegation_invite_received',
      v_uid,
      jsonb_build_object(
        'delegation_id', v_id,
        'scope_type',    p_scope_type,
        'project_id',    p_project_id,
        'project_title', v_project_title,
        'preset',        p_preset
      )
    );
  end if;

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_delegation_invite_for_profile: in-app delegate is always known.
-- ---------------------------------------------------------------------------
create or replace function public.create_delegation_invite_for_profile(
  p_delegate_profile_id uuid,
  p_scope_type          public.delegation_scope_type,
  p_project_id          uuid                          default null,
  p_permissions         text[]                        default null,
  p_preset              public.delegation_preset_type default null,
  p_note                text                          default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_email         text;
  v_permissions   text[];
  v_id            uuid;
  v_token         uuid;
  v_now           timestamptz := now();
  v_project_title text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  if p_delegate_profile_id is null then
    raise exception 'delegate_not_found' using errcode = 'P0001';
  end if;
  if p_delegate_profile_id = v_uid then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;
  if p_scope_type = 'project' and p_project_id is null then
    raise exception 'invalid_scope' using errcode = 'P0001';
  end if;
  if p_scope_type = 'project' then
    if not exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and (p.curator_id = v_uid or p.host_profile_id = v_uid)
    ) then
      raise exception 'project_not_found' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(trim(u.email), '') into v_email
    from auth.users u where u.id = p_delegate_profile_id;
  if v_email is null or v_email = '' then
    raise exception 'delegate_not_found' using errcode = 'P0001';
  end if;

  if p_preset is not null then
    if not public.delegation_preset_is_valid_for_scope(p_preset, p_scope_type) then
      raise exception 'invalid_scope' using errcode = 'P0001';
    end if;
    v_permissions := public.delegation_preset_permissions(p_preset);
  else
    v_permissions := coalesce(p_permissions, array['view','edit_metadata','manage_works']);
  end if;

  if exists (
    select 1 from public.delegations d
     where d.delegator_profile_id = v_uid
       and d.delegate_profile_id = p_delegate_profile_id
       and d.scope_type = p_scope_type
       and (d.project_id is not distinct from p_project_id)
       and d.status in ('pending','active')
  ) then
    raise exception 'duplicate_pending_invite' using errcode = 'P0001';
  end if;

  insert into public.delegations (
    delegator_profile_id, delegate_profile_id, delegate_email,
    scope_type, project_id, permissions, preset, note, status,
    invited_at, invited_by, updated_at
  ) values (
    v_uid, p_delegate_profile_id, lower(v_email),
    p_scope_type, p_project_id, v_permissions, p_preset,
    nullif(trim(p_note), ''), 'pending',
    v_now, v_uid, v_now
  )
  returning id, invite_token into v_id, v_token;

  perform public.record_delegation_event(
    v_id, 'invite_created', 'profile', p_delegate_profile_id,
    null,
    jsonb_build_object('preset', p_preset, 'scope', p_scope_type)
  );

  if p_scope_type = 'project' and p_project_id is not null then
    select title into v_project_title from public.projects where id = p_project_id;
  end if;

  perform public._record_delegation_notification(
    p_delegate_profile_id,
    'delegation_invite_received',
    v_uid,
    jsonb_build_object(
      'delegation_id', v_id,
      'scope_type',    p_scope_type,
      'project_id',    p_project_id,
      'project_title', v_project_title,
      'preset',        p_preset
    )
  );

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_delegation_by_id: notify delegator.
-- ---------------------------------------------------------------------------
create or replace function public.accept_delegation_by_id(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_d   record;
  v_project_title text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status = 'active', accepted_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending'
  returning id, delegator_profile_id, scope_type, project_id
       into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'invite_accepted', 'profile', v_uid, null, '{}'::jsonb
  );

  if v_d.project_id is not null then
    select title into v_project_title from public.projects where id = v_d.project_id;
  end if;

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_accepted',
    v_uid,
    jsonb_build_object(
      'delegation_id', v_d.id,
      'scope_type',    v_d.scope_type,
      'project_id',    v_d.project_id,
      'project_title', v_project_title
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_delegation_by_token: notify delegator.
-- ---------------------------------------------------------------------------
create or replace function public.accept_delegation_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_now   timestamptz := now();
  v_d     record;
  v_project_title text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  select d.id, d.delegate_email, d.status, d.delegator_profile_id,
         d.scope_type, d.project_id
    into v_d
    from public.delegations d where d.invite_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_d.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'already_used');
  end if;
  select coalesce(trim(u.email), '') into v_email from auth.users u where u.id = v_uid;
  if lower(trim(v_d.delegate_email)) <> lower(v_email) then
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;
  update public.delegations
     set delegate_profile_id = v_uid,
         status = 'active',
         accepted_at = v_now,
         updated_at = v_now
   where id = v_d.id;

  perform public.record_delegation_event(
    v_d.id, 'invite_accepted', 'profile', v_uid, null,
    jsonb_build_object('via', 'token')
  );

  if v_d.project_id is not null then
    select title into v_project_title from public.projects where id = v_d.project_id;
  end if;

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_accepted',
    v_uid,
    jsonb_build_object(
      'delegation_id', v_d.id,
      'scope_type',    v_d.scope_type,
      'project_id',    v_d.project_id,
      'project_title', v_project_title,
      'via',           'token'
    )
  );

  return jsonb_build_object('ok', true, 'id', v_d.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- decline_delegation_by_id: notify delegator.
-- ---------------------------------------------------------------------------
create or replace function public.decline_delegation_by_id(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_d   record;
  v_project_title text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  update public.delegations
     set status = 'declined', declined_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending'
  returning id, delegator_profile_id, scope_type, project_id
       into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'invite_declined', 'profile', v_uid, null, '{}'::jsonb
  );

  if v_d.project_id is not null then
    select title into v_project_title from public.projects where id = v_d.project_id;
  end if;

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_declined',
    v_uid,
    jsonb_build_object(
      'delegation_id', v_d.id,
      'scope_type',    v_d.scope_type,
      'project_id',    v_d.project_id,
      'project_title', v_project_title
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_delegation: notify delegate (only if delegate_profile_id is known;
-- for pending email-only invites there's nobody to in-app notify).
-- ---------------------------------------------------------------------------
create or replace function public.revoke_delegation(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_d   record;
  v_project_title text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  update public.delegations
     set status = 'revoked',
         revoked_at = v_now,
         revoked_by = v_uid,
         updated_at = v_now
   where id = p_delegation_id
     and delegator_profile_id = v_uid
     and status in ('pending','active')
  returning id, delegate_profile_id, scope_type, project_id
       into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_owned');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'delegation_revoked', 'profile', v_uid, null, '{}'::jsonb
  );

  if v_d.delegate_profile_id is not null then
    if v_d.project_id is not null then
      select title into v_project_title from public.projects where id = v_d.project_id;
    end if;
    perform public._record_delegation_notification(
      v_d.delegate_profile_id,
      'delegation_revoked',
      v_uid,
      jsonb_build_object(
        'delegation_id', v_d.id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'project_title', v_project_title
      )
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth-signup trigger: when a new user signs up and we auto-link/accept
-- pending invites, fire one `delegation_accepted` notification per
-- delegator so they know it landed.
-- ---------------------------------------------------------------------------
create or replace function public.handle_auth_user_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_now  timestamptz := now();
  v_d    record;
  v_project_title text;
begin
  for v_id in
    select id from public.delegations
     where lower(trim(delegate_email)) = lower(coalesce(trim(new.email), ''))
       and status = 'pending'
       and delegate_profile_id is null
  loop
    update public.delegations
       set delegate_profile_id = new.id,
           status = 'active',
           accepted_at = v_now,
           updated_at = v_now
     where id = v_id;

    insert into public.delegation_activity_events (
      delegation_id, actor_profile_id, owner_profile_id, scope_type,
      project_id, event_type, summary, metadata
    )
    select v_id, new.id, d.delegator_profile_id, d.scope_type, d.project_id,
           'invite_accepted', 'Auto-accepted via signup',
           jsonb_build_object('via', 'auth_signup')
      from public.delegations d
     where d.id = v_id;

    select d.delegator_profile_id, d.scope_type, d.project_id
      into v_d
      from public.delegations d
     where d.id = v_id;

    v_project_title := null;
    if v_d.project_id is not null then
      select title into v_project_title from public.projects where id = v_d.project_id;
    end if;

    perform public._record_delegation_notification(
      v_d.delegator_profile_id,
      'delegation_accepted',
      new.id,
      jsonb_build_object(
        'delegation_id', v_id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'project_title', v_project_title,
        'via',           'auth_signup'
      )
    );
  end loop;
  return new;
end;
$$;

commit;
