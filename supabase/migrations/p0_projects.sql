-- Provenance v1: projects (exhibition / curated program)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_type text not null default 'exhibition',
  title text not null,
  start_date date,
  end_date date,
  status text not null default 'planned', -- planned|live|ended
  curator_id uuid not null references public.profiles(id),
  host_name text,
  host_profile_id uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_projects_curator_id on public.projects(curator_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_start_date on public.projects(start_date);

alter table public.projects enable row level security;

drop policy if exists projects_insert_update_delete_curator on public.projects;
create policy projects_insert_update_delete_curator on public.projects
  for all
  to authenticated
  using (curator_id = auth.uid())
  with check (curator_id = auth.uid());

drop policy if exists projects_select_public on public.projects;
create policy projects_select_public on public.projects
  for select
  to public
  using (true);

grant select, insert, update, delete on public.projects to authenticated;
