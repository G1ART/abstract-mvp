-- Exhibition bucket: which works belong to which exhibition (project).
-- Design: docs/EXHIBITION_PROJECT_AND_MULTI_CLAIM_DESIGN.md
-- D1: added_by_profile_id stored but not shown publicly.

create table if not exists public.exhibition_works (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.projects(id) on delete cascade,
  work_id uuid not null references public.artworks(id) on delete cascade,
  added_by_profile_id uuid references public.profiles(id) on delete set null,
  sort_order int,
  created_at timestamptz not null default now(),
  unique (exhibition_id, work_id)
);

create index if not exists idx_exhibition_works_exhibition_id on public.exhibition_works(exhibition_id);
create index if not exists idx_exhibition_works_work_id on public.exhibition_works(work_id);

comment on table public.exhibition_works is 'Which works are included in which exhibition (project). Claims (EXHIBITED/CURATED) stay on work; this table only tracks exhibition bucket membership.';
comment on column public.exhibition_works.added_by_profile_id is 'Who added this work to this exhibition (internal/admin only, not shown publicly).';

alter table public.exhibition_works enable row level security;

-- Select: anyone can see (for public exhibition pages and "this work participated in these exhibitions").
create policy exhibition_works_select on public.exhibition_works
  for select to public
  using (true);

-- Insert/update/delete: only exhibition curator or host.
create policy exhibition_works_insert on public.exhibition_works
  for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

create policy exhibition_works_update on public.exhibition_works
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

create policy exhibition_works_delete on public.exhibition_works
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

grant select, insert, update, delete on public.exhibition_works to authenticated;
grant select on public.exhibition_works to anon;
