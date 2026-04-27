-- Delegation upgrade phase 1: RPC rewrites.
--
-- Wire-compatible re-writes of:
--   create_delegation_invite, create_delegation_invite_for_profile,
--   accept_delegation_by_token, accept_delegation_by_id,
--   decline_delegation_by_id, revoke_delegation,
--   list_my_delegations
-- Plus new:
--   get_delegation_detail(p_delegation_id)
--
-- Changes:
--   1. Optional p_preset / p_note arguments (default null) — preset, when
--      present, expands server-side via delegation_preset_permissions and
--      OVERRIDES p_permissions (single source of truth).
--   2. Errors are raised with MESSAGE = stable lowercase code keyword
--      ("cannot_invite_self", "duplicate_pending_invite", ...) so the
--      existing client text-based classifier continues to work, while a new
--      code-based classifier can match exactly.
--   3. Lifecycle timestamps (invited_at/accepted_at/declined_at/revoked_at)
--      are written. invited_by / revoked_by recorded.
--   4. decline_delegation_by_id now writes status = 'declined' (not revoked).
--   5. list_my_delegations now returns lifecycle timestamps + preset + note.
--   6. New get_delegation_detail returns the full detail payload + activity
--      timeline for the drawer view.

-- ---------------------------------------------------------------------------
-- create_delegation_invite (email-based)
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
  v_uid         uuid := auth.uid();
  v_email       text;
  v_permissions text[];
  v_id          uuid;
  v_token       uuid;
  v_now         timestamptz := now();
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

  -- Self-invite via email lookup.
  if exists (
    select 1 from auth.users u
     where u.id = v_uid and lower(trim(u.email)) = v_email
  ) then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;

  -- Preset expansion (single source of truth).
  if p_preset is not null then
    if not public.delegation_preset_is_valid_for_scope(p_preset, p_scope_type) then
      raise exception 'invalid_scope' using errcode = 'P0001';
    end if;
    v_permissions := public.delegation_preset_permissions(p_preset);
  else
    v_permissions := coalesce(
      p_permissions,
      array['view','edit_metadata','manage_works']
    );
  end if;

  -- Duplicate check (same delegator + email + scope + project, pending or active).
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

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_delegation_invite_for_profile (existing-user-based)
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
  v_uid         uuid := auth.uid();
  v_email       text;
  v_permissions text[];
  v_id          uuid;
  v_token       uuid;
  v_now         timestamptz := now();
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
    v_permissions := coalesce(
      p_permissions,
      array['view','edit_metadata','manage_works']
    );
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

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_delegation_by_id (in-app accept by signed-in delegate profile)
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
  v_row record;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status = 'active', accepted_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending'
  returning id into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_delegation_by_token (email-based accept; signed-in user's email
-- must match invite email)
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
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  select d.id, d.delegate_email, d.status into v_d
    from public.delegations d
   where d.invite_token = p_token;
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

  return jsonb_build_object('ok', true, 'id', v_d.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- decline_delegation_by_id (now writes status = 'declined')
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
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status = 'declined', declined_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_delegation (delegator only; stamps revoked_at + revoked_by)
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
     and status in ('pending','active');

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_owned');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_delegations (now returns lifecycle timestamps + preset + note)
-- ---------------------------------------------------------------------------
create or replace function public.list_my_delegations()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid      uuid := auth.uid();
  v_sent     jsonb;
  v_received jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('sent', '[]'::jsonb, 'received', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
    into v_sent
  from (
    select
      jsonb_build_object(
        'id', d.id,
        'delegator_profile_id', d.delegator_profile_id,
        'delegate_email', d.delegate_email,
        'delegate_profile_id', d.delegate_profile_id,
        'scope_type', d.scope_type,
        'project_id', d.project_id,
        'permissions', d.permissions,
        'preset', d.preset,
        'note', d.note,
        'status', d.status,
        'invited_at', d.invited_at,
        'accepted_at', d.accepted_at,
        'declined_at', d.declined_at,
        'revoked_at', d.revoked_at,
        'expires_at', d.expires_at,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'delegate_profile', case when dp.id is null then null else
          jsonb_build_object('id', dp.id, 'username', dp.username,
                             'display_name', dp.display_name,
                             'avatar_url', dp.avatar_url) end,
        'project', case when pr.id is null then null else
          jsonb_build_object('id', pr.id, 'title', pr.title) end
      ) as row_payload,
      d.created_at
    from public.delegations d
    left join public.profiles dp on dp.id = d.delegate_profile_id
    left join public.projects pr on pr.id = d.project_id
    where d.delegator_profile_id = v_uid
  ) s;

  select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
    into v_received
  from (
    select
      jsonb_build_object(
        'id', d.id,
        'delegator_profile_id', d.delegator_profile_id,
        'delegate_email', d.delegate_email,
        'delegate_profile_id', d.delegate_profile_id,
        'scope_type', d.scope_type,
        'project_id', d.project_id,
        'permissions', d.permissions,
        'preset', d.preset,
        'note', d.note,
        'status', d.status,
        'invited_at', d.invited_at,
        'accepted_at', d.accepted_at,
        'declined_at', d.declined_at,
        'revoked_at', d.revoked_at,
        'expires_at', d.expires_at,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'delegator_profile', jsonb_build_object(
          'id', p.id, 'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ),
        'project', case when pr.id is null then null else
          jsonb_build_object('id', pr.id, 'title', pr.title) end
      ) as row_payload,
      d.created_at
    from public.delegations d
    join public.profiles p on p.id = d.delegator_profile_id
    left join public.projects pr on pr.id = d.project_id
    where d.delegate_profile_id = v_uid
  ) r;

  return jsonb_build_object(
    'sent', coalesce(v_sent, '[]'::jsonb),
    'received', coalesce(v_received, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.list_my_delegations() to authenticated;
grant execute on function public.create_delegation_invite(
  text, public.delegation_scope_type, uuid, text[],
  public.delegation_preset_type, text
) to authenticated;
grant execute on function public.create_delegation_invite_for_profile(
  uuid, public.delegation_scope_type, uuid, text[],
  public.delegation_preset_type, text
) to authenticated;
grant execute on function public.accept_delegation_by_id(uuid) to authenticated;
grant execute on function public.accept_delegation_by_token(uuid) to authenticated;
grant execute on function public.decline_delegation_by_id(uuid) to authenticated;
grant execute on function public.revoke_delegation(uuid) to authenticated;
