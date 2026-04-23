-- Monetization Spine — workspaces domain foundation.
--
-- Workspaces are the org/gallery container that eventually hosts shared
-- inventory, multi-seat access and centralized billing. This migration
-- only lands the schema and RLS; the frontend is intentionally deferred
-- to the Gallery Workspace launch patch.
--
-- Shape:
--   workspaces           — one row per org, pinned to an owner profile.
--   workspace_members    — profile ↔ workspace with role + status.
--   workspace_invites    — email-bound invite tokens.
--
-- RLS philosophy:
--   * Reads are restricted to members of the workspace.
--   * Writes use a SECURITY DEFINER helper so we never hit the nested-RLS
--     recursion that bit us in shortlists (see 20260422140000).

begin;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  plan_key text not null default 'gallery_workspace',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_idx on public.workspaces (owner_profile_id);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  invited_by uuid null references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz null,
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'removed')),
  unique (workspace_id, member_profile_id)
);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members (workspace_id);
create index if not exists workspace_members_profile_idx
  on public.workspace_members (member_profile_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'operator', 'viewer')),
  token text not null unique,
  expires_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete set null
);

create index if not exists workspace_invites_workspace_idx
  on public.workspace_invites (workspace_id);
create index if not exists workspace_invites_email_idx
  on public.workspace_invites (lower(email));

-- SECURITY DEFINER helper to avoid nested-RLS recursion.
create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = _workspace_id
       and wm.member_profile_id = auth.uid()
       and wm.status = 'active'
  );
$$;

create or replace function public.is_workspace_owner(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspaces w
     where w.id = _workspace_id
       and w.owner_profile_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member
  on public.workspaces
  for select
  using (
    owner_profile_id = auth.uid()
    or public.is_workspace_member(id)
  );

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner
  on public.workspaces
  for insert
  with check (owner_profile_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner
  on public.workspaces
  for update
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select
  on public.workspace_members
  for select
  using (
    member_profile_id = auth.uid()
    or public.is_workspace_owner(workspace_id)
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists workspace_members_manage_owner on public.workspace_members;
create policy workspace_members_manage_owner
  on public.workspace_members
  for all
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select
  on public.workspace_invites
  for select
  using (public.is_workspace_owner(workspace_id));

drop policy if exists workspace_invites_manage_owner on public.workspace_invites;
create policy workspace_invites_manage_owner
  on public.workspace_invites
  for all
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select on public.workspace_invites to authenticated;
grant insert, update on public.workspaces to authenticated;
grant insert, update, delete on public.workspace_members to authenticated;
grant insert, update, delete on public.workspace_invites to authenticated;

comment on table public.workspaces is
  'Gallery/org workspace container. Holds plan + seat metadata. UI lands in a later patch.';
comment on table public.workspace_members is
  'Workspace membership with role (owner/admin/operator/viewer) and lifecycle status.';
comment on table public.workspace_invites is
  'Email-bound workspace invitations. Consumed to create workspace_members rows.';

commit;
