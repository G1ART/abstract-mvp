-- Delegation upgrade phase 1: activity log.
--
-- Append-only audit table for delegation lifecycle and (later) per-action
-- delegated mutations. Inserts go through SECURITY DEFINER RPCs only.

create table if not exists public.delegation_activity_events (
  id                  uuid primary key default gen_random_uuid(),
  delegation_id       uuid not null references public.delegations(id) on delete cascade,
  actor_profile_id    uuid references public.profiles(id) on delete set null,
  owner_profile_id    uuid not null references public.profiles(id) on delete cascade,
  scope_type          public.delegation_scope_type not null,
  project_id          uuid references public.projects(id) on delete set null,
  event_type          text not null,
  target_type         text,
  target_id           uuid,
  summary             text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists idx_delegation_events_delegation
  on public.delegation_activity_events(delegation_id, created_at desc);
create index if not exists idx_delegation_events_owner
  on public.delegation_activity_events(owner_profile_id, created_at desc);
create index if not exists idx_delegation_events_actor
  on public.delegation_activity_events(actor_profile_id, created_at desc);

alter table public.delegation_activity_events enable row level security;

-- Read access: actor (delegate), owner (delegator), or any participant of the
-- referenced delegation.
create policy delegation_events_read_participants
  on public.delegation_activity_events
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or owner_profile_id = auth.uid()
    or exists (
      select 1 from public.delegations d
       where d.id = delegation_activity_events.delegation_id
         and (d.delegator_profile_id = auth.uid()
              or d.delegate_profile_id = auth.uid())
    )
  );

-- No direct insert/update/delete for end users; SECURITY DEFINER RPCs only.
revoke insert, update, delete on public.delegation_activity_events from authenticated, anon;
grant select on public.delegation_activity_events to authenticated;

-- Internal recorder. SECURITY DEFINER, so it bypasses the RLS write block.
-- Callers must already have validated authority before calling.
create or replace function public.record_delegation_event(
  p_delegation_id uuid,
  p_event_type    text,
  p_target_type   text  default null,
  p_target_id     uuid  default null,
  p_summary       text  default null,
  p_metadata      jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d record;
begin
  if p_delegation_id is null or p_event_type is null then
    return;
  end if;
  select d.delegator_profile_id, d.scope_type, d.project_id
    into v_d
    from public.delegations d
   where d.id = p_delegation_id;
  if not found then
    return;
  end if;

  insert into public.delegation_activity_events (
    delegation_id, actor_profile_id, owner_profile_id, scope_type,
    project_id, event_type, target_type, target_id, summary, metadata
  ) values (
    p_delegation_id, auth.uid(), v_d.delegator_profile_id, v_d.scope_type,
    v_d.project_id, p_event_type, p_target_type, p_target_id, p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_delegation_event(uuid, text, text, uuid, text, jsonb) from public;
-- Internal helper: not exposed to clients directly, but lifecycle RPCs
-- (which are themselves SECURITY DEFINER) call it.

-- Wrap lifecycle RPCs to record events. We re-define each RPC again
-- (CREATE OR REPLACE) appending the event call right before the success
-- return. To avoid duplicating SQL bodies in two places, we use
-- AFTER-style wrapper RPCs that call into the now-existing RPCs is complex;
-- instead we patch the lifecycle inline.

-- Patch: create_delegation_invite -> record 'invite_created'
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

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

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

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

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
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status = 'active', accepted_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending'
  returning id, delegator_profile_id into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'invite_accepted', 'profile', v_uid, null, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

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
  return jsonb_build_object('ok', true, 'id', v_d.id);
end;
$$;

create or replace function public.decline_delegation_by_id(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  update public.delegations
     set status = 'declined', declined_at = v_now, updated_at = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'pending'
  returning id into v_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;

  perform public.record_delegation_event(
    v_id, 'invite_declined', 'profile', v_uid, null, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revoke_delegation(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_id  uuid;
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
  returning id into v_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_owned');
  end if;

  perform public.record_delegation_event(
    v_id, 'delegation_revoked', 'profile', v_uid, null, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- get_delegation_detail: rich payload for the detail drawer.
create or replace function public.get_delegation_detail(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid     uuid := auth.uid();
  v_d       record;
  v_owner   jsonb;
  v_dele    jsonb;
  v_project jsonb;
  v_events  jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select d.* into v_d from public.delegations d where d.id = p_delegation_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_d.delegator_profile_id <> v_uid and v_d.delegate_profile_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select to_jsonb(p) into v_owner
    from (select id, username, display_name, avatar_url
            from public.profiles where id = v_d.delegator_profile_id) p;
  if v_d.delegate_profile_id is not null then
    select to_jsonb(p) into v_dele
      from (select id, username, display_name, avatar_url
              from public.profiles where id = v_d.delegate_profile_id) p;
  end if;
  if v_d.project_id is not null then
    select to_jsonb(p) into v_project
      from (select id, title from public.projects where id = v_d.project_id) p;
  end if;

  select coalesce(jsonb_agg(payload order by created_at desc), '[]'::jsonb)
    into v_events
  from (
    select jsonb_build_object(
      'id', e.id,
      'event_type', e.event_type,
      'target_type', e.target_type,
      'target_id', e.target_id,
      'summary', e.summary,
      'metadata', e.metadata,
      'actor_profile_id', e.actor_profile_id,
      'created_at', e.created_at
    ) as payload, e.created_at
      from public.delegation_activity_events e
     where e.delegation_id = v_d.id
     order by e.created_at desc
     limit 25
  ) sub;

  return jsonb_build_object(
    'ok', true,
    'delegation', jsonb_build_object(
      'id', v_d.id,
      'delegator_profile_id', v_d.delegator_profile_id,
      'delegate_profile_id', v_d.delegate_profile_id,
      'delegate_email', v_d.delegate_email,
      'scope_type', v_d.scope_type,
      'project_id', v_d.project_id,
      'permissions', v_d.permissions,
      'preset', v_d.preset,
      'note', v_d.note,
      'status', v_d.status,
      'invited_at', v_d.invited_at,
      'accepted_at', v_d.accepted_at,
      'declined_at', v_d.declined_at,
      'revoked_at', v_d.revoked_at,
      'expires_at', v_d.expires_at,
      'created_at', v_d.created_at,
      'updated_at', v_d.updated_at
    ),
    'delegator_profile', v_owner,
    'delegate_profile', v_dele,
    'project', v_project,
    'events', v_events
  );
end;
$$;

grant execute on function public.get_delegation_detail(uuid) to authenticated;

-- The auth-user-created trigger now records 'invite_accepted' for any rows
-- that get auto-linked + activated by email match.
create or replace function public.handle_auth_user_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_now  timestamptz := now();
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
  end loop;
  return new;
end;
$$;
