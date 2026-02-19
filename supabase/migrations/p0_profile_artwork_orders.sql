-- Profile-specific artwork sort orders.
-- Allows each profile (artist, curator, gallery) to have their own ordering
-- for artworks they display, independent of the artist's default order.

create table if not exists public.profile_artwork_orders (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  sort_order bigint not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, artwork_id)
);

create index if not exists profile_artwork_orders_profile_id_idx
  on public.profile_artwork_orders(profile_id);

create index if not exists profile_artwork_orders_artwork_id_idx
  on public.profile_artwork_orders(artwork_id);

create index if not exists profile_artwork_orders_sort_idx
  on public.profile_artwork_orders(profile_id, sort_order asc nulls last);

-- RLS: Users can read all profile orders (for display), but only update their own.
alter table public.profile_artwork_orders enable row level security;

drop policy if exists profile_artwork_orders_select on public.profile_artwork_orders;
create policy profile_artwork_orders_select on public.profile_artwork_orders
  for select
  using (true);

drop policy if exists profile_artwork_orders_insert on public.profile_artwork_orders;
create policy profile_artwork_orders_insert on public.profile_artwork_orders
  for insert
  with check (auth.uid() = profile_id);

drop policy if exists profile_artwork_orders_update on public.profile_artwork_orders;
create policy profile_artwork_orders_update on public.profile_artwork_orders
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists profile_artwork_orders_delete on public.profile_artwork_orders;
create policy profile_artwork_orders_delete on public.profile_artwork_orders
  for delete
  using (auth.uid() = profile_id);
