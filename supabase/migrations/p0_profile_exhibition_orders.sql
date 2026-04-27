-- Profile-specific exhibition sort orders.
-- Mirrors `profile_artwork_orders`: each profile (curator/host/artist with
-- works in the show) can save their own ordering for the exhibitions that
-- appear on their public profile, independent of the project's own metadata.
--
-- Used by the public profile (`/u/{username}`) "전시" tab and by My Studio
-- (`/my`) when the same `manual` sort mode is selected. Reordering itself
-- happens on the public profile (single source of truth, mirrors how
-- artwork reorder works today). My Studio surfaces the manual order via a
-- read-only sort toggle and a deep link to the public preview.

create table if not exists public.profile_exhibition_orders (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exhibition_id uuid not null references public.projects(id) on delete cascade,
  sort_order bigint not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, exhibition_id)
);

create index if not exists profile_exhibition_orders_profile_id_idx
  on public.profile_exhibition_orders(profile_id);

create index if not exists profile_exhibition_orders_exhibition_id_idx
  on public.profile_exhibition_orders(exhibition_id);

create index if not exists profile_exhibition_orders_sort_idx
  on public.profile_exhibition_orders(profile_id, sort_order asc nulls last);

-- RLS: anyone may read (public ordering); only the owning profile may
-- insert / update / delete its own rows. This matches profile_artwork_orders
-- exactly so future tooling can share helpers.
alter table public.profile_exhibition_orders enable row level security;

drop policy if exists profile_exhibition_orders_select on public.profile_exhibition_orders;
create policy profile_exhibition_orders_select on public.profile_exhibition_orders
  for select
  using (true);

drop policy if exists profile_exhibition_orders_insert on public.profile_exhibition_orders;
create policy profile_exhibition_orders_insert on public.profile_exhibition_orders
  for insert
  with check (auth.uid() = profile_id);

drop policy if exists profile_exhibition_orders_update on public.profile_exhibition_orders;
create policy profile_exhibition_orders_update on public.profile_exhibition_orders
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists profile_exhibition_orders_delete on public.profile_exhibition_orders;
create policy profile_exhibition_orders_delete on public.profile_exhibition_orders
  for delete
  using (auth.uid() = profile_id);
