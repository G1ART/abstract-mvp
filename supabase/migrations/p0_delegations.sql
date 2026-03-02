-- Delegations: allow a profile to grant another profile (or invite by email) access to manage
-- account, a specific project (exhibition), or inventory. Used for managers, co-curators, assistants.

create type public.delegation_scope_type as enum ('account', 'project', 'inventory');
create type public.delegation_status_type as enum ('pending', 'active', 'revoked');

create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_profile_id uuid not null references public.profiles(id) on delete cascade,
  delegate_profile_id uuid references public.profiles(id) on delete cascade,
  delegate_email text not null,
  scope_type public.delegation_scope_type not null,
  project_id uuid references public.projects(id) on delete cascade,
  permissions text[] not null default array['view', 'edit_metadata', 'manage_works'],
  invite_token uuid not null default gen_random_uuid() unique,
  status public.delegation_status_type not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegations_project_required check (
    (scope_type <> 'project') or (scope_type = 'project' and project_id is not null)
  )
);

create index if not exists idx_delegations_delegator on public.delegations(delegator_profile_id);
create index if not exists idx_delegations_delegate on public.delegations(delegate_profile_id);
create index if not exists idx_delegations_project on public.delegations(project_id);
create index if not exists idx_delegations_invite_token on public.delegations(invite_token);
create index if not exists idx_delegations_status on public.delegations(status);

alter table public.delegations enable row level security;

-- Delegator: full control over rows they created
create policy delegations_delegator_all on public.delegations
  for all to authenticated
  using (delegator_profile_id = auth.uid())
  with check (delegator_profile_id = auth.uid());

-- Delegate: can read rows where they are the delegate (to show "manage X's exhibition" etc.)
create policy delegations_delegate_select on public.delegations
  for select to authenticated
  using (delegate_profile_id = auth.uid());

-- Anonymous/unauthenticated: no access to table. Token-based lookup via RPC only.
grant select, insert, update, delete on public.delegations to authenticated;

-- RPC: create delegation invite (returns invite_token for email link)
create or replace function public.create_delegation_invite(
  p_delegate_email text,
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
  v_id uuid;
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if nullif(trim(p_delegate_email), '') is null then
    raise exception 'delegate_email required';
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

  insert into public.delegations (
    delegator_profile_id, delegate_email, scope_type, project_id, permissions, status, updated_at
  )
  values (
    v_uid, trim(lower(p_delegate_email)), p_scope_type, p_project_id,
    coalesce(p_permissions, array['view', 'edit_metadata', 'manage_works']),
    'pending', now()
  )
  returning id, invite_token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'invite_token', v_token);
end;
$$;

-- RPC: get delegation by token (for invite landing page; only safe fields, only pending)
create or replace function public.get_delegation_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_delegator record;
  v_project record;
begin
  select d.id, d.delegate_email, d.scope_type, d.project_id, d.status, d.delegator_profile_id
  into v_row
  from public.delegations d
  where d.invite_token = p_token and d.status = 'pending';
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select p.id, p.username, p.display_name into v_delegator
  from public.profiles p where p.id = v_row.delegator_profile_id;

  if v_row.project_id is not null then
    select pr.id, pr.title into v_project from public.projects pr where pr.id = v_row.project_id;
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_row.id,
    'delegate_email', v_row.delegate_email,
    'scope_type', v_row.scope_type,
    'status', v_row.status,
    'delegator', to_jsonb(v_delegator),
    'project', case when v_project is null then null else to_jsonb(v_project) end
  );
end;
$$;

-- RPC: accept delegation (caller must be logged in; email must match delegate_email)
create or replace function public.accept_delegation_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_d record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select d.id, d.delegate_email, d.status into v_d
  from public.delegations d
  where d.invite_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_d.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  select coalesce(trim(u.email), '') into v_email from auth.users u where u.id = v_uid;
  if lower(trim(v_d.delegate_email)) <> lower(v_email) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  update public.delegations
  set delegate_profile_id = v_uid, status = 'active', updated_at = now()
  where id = v_d.id;

  return jsonb_build_object('ok', true, 'id', v_d.id);
end;
$$;

-- RPC: revoke delegation (delegator only)
create or replace function public.revoke_delegation(p_delegation_id uuid)
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
  where id = p_delegation_id and delegator_profile_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC: list delegations for current user (as delegator and as delegate)
create or replace function public.list_my_delegations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sent jsonb;
  v_received jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('sent', '[]'::jsonb, 'received', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id, 'delegate_email', d.delegate_email, 'delegate_profile_id', d.delegate_profile_id,
      'scope_type', d.scope_type, 'project_id', d.project_id, 'permissions', d.permissions,
      'status', d.status, 'created_at', d.created_at,
      'delegate_profile', case when dp.id is null then null else jsonb_build_object('id', dp.id, 'username', dp.username, 'display_name', dp.display_name) end,
      'project', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'title', pr.title) end
    ) order by d.created_at desc
  ), '[]'::jsonb) into v_sent
  from public.delegations d
  left join public.profiles dp on dp.id = d.delegate_profile_id
  left join public.projects pr on pr.id = d.project_id
  where d.delegator_profile_id = v_uid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id, 'delegator_profile_id', d.delegator_profile_id, 'scope_type', d.scope_type,
      'project_id', d.project_id, 'permissions', d.permissions, 'status', d.status, 'created_at', d.created_at,
      'delegator_profile', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name),
      'project', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'title', pr.title) end
    ) order by d.created_at desc
  ), '[]'::jsonb) into v_received
  from public.delegations d
  join public.profiles p on p.id = d.delegator_profile_id
  left join public.projects pr on pr.id = d.project_id
  where d.delegate_profile_id = v_uid;

  return jsonb_build_object('sent', coalesce(v_sent, '[]'::jsonb), 'received', coalesce(v_received, '[]'::jsonb));
end;
$$;

-- Trigger: on new auth user, link pending delegations for that email
create or replace function public.handle_auth_user_created_link_delegations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.delegations
  set delegate_profile_id = new.id, status = 'active', updated_at = now()
  where lower(trim(delegate_email)) = lower(coalesce(trim(new.email), ''))
    and status = 'pending' and delegate_profile_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_delegations on auth.users;
create trigger on_auth_user_created_link_delegations
  after insert on auth.users
  for each row execute function public.handle_auth_user_created_link_delegations();
