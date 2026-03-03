-- Invite existing user by profile (no email required). Delegate must accept in-app.

create or replace function public.create_delegation_invite_for_profile(
  p_delegate_profile_id uuid,
  p_scope_type public.delegation_scope_type,
  p_project_id uuid default null,
  p_permissions text[] default array['view', 'edit_metadata', 'manage_works']
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_delegate_profile_id is null then
    raise exception 'delegate_profile_id required';
  end if;
  if p_delegate_profile_id = v_uid then
    raise exception 'Cannot invite yourself';
  end if;
  if p_scope_type = 'project' and p_project_id is null then
    raise exception 'project_id required for project scope';
  end if;
  if p_scope_type = 'project' then
    if not exists (
      select 1 from public.projects p
      where p.id = p_project_id and (p.curator_id = v_uid or p.host_profile_id = v_uid)
    ) then
      raise exception 'Not allowed to delegate this project';
    end if;
  end if;

  select coalesce(trim(u.email), '') into v_email from auth.users u where u.id = p_delegate_profile_id;
  if v_email is null or v_email = '' then
    raise exception 'Delegate user has no email';
  end if;

  if exists (
    select 1 from public.delegations d
    where d.delegator_profile_id = v_uid and d.delegate_profile_id = p_delegate_profile_id
      and d.scope_type = p_scope_type and (d.project_id is not distinct from p_project_id)
      and d.status in ('pending', 'active')
  ) then
    raise exception 'Invitation or delegation already exists for this user and scope';
  end if;

  insert into public.delegations (
    delegator_profile_id, delegate_profile_id, delegate_email, scope_type, project_id, permissions, status, updated_at
  )
  values (
    v_uid, p_delegate_profile_id, v_email, p_scope_type, p_project_id,
    coalesce(p_permissions, array['view', 'edit_metadata', 'manage_works']),
    'pending', now()
  )
  returning id, invite_token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- Accept a pending delegation (delegate only; for in-app accept after invite-by-profile).
create or replace function public.accept_delegation_by_id(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.delegations
  set status = 'active', updated_at = now()
  where id = p_delegation_id and delegate_profile_id = v_uid and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_not_pending');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Decline a pending delegation (delegate only).
create or replace function public.decline_delegation_by_id(p_delegation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.delegations
  set status = 'revoked', updated_at = now()
  where id = p_delegation_id and delegate_profile_id = v_uid and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_not_pending');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
