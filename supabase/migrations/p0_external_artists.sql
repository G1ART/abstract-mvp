-- Provenance v1: external_artists (stub for artists not yet on Abstract)
create table if not exists public.external_artists (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  website text,
  instagram text,
  invite_email text,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz default now(),
  status text not null default 'invited', -- invited|claimed|merged
  claimed_profile_id uuid references public.profiles(id)
);

create index if not exists idx_external_artists_invited_by on public.external_artists(invited_by);
create index if not exists idx_external_artists_display_name on public.external_artists(lower(display_name));

alter table public.external_artists enable row level security;

drop policy if exists external_artists_all_own on public.external_artists;
create policy external_artists_all_own on public.external_artists
  for all
  to authenticated
  using (invited_by = auth.uid())
  with check (invited_by = auth.uid());

grant select, insert, update, delete on public.external_artists to authenticated;
