-- Website-assisted bulk import: durable session + optional artwork provenance JSON.

alter table public.artworks
  add column if not exists website_import_provenance jsonb;

comment on column public.artworks.website_import_provenance is
  'Structured provenance for fields filled via website-assisted import (source URLs, confidence, raw snippets). User-reviewed; not shown publicly unless product surfaces it.';

create table if not exists public.website_import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  acting_profile_id uuid references public.profiles(id) on delete set null,
  source_url text not null,
  status text not null default 'created'
    check (status in (
      'created',
      'scanning',
      'scan_done',
      'matching',
      'matched',
      'applied',
      'failed',
      'cancelled'
    )),
  scan_error text,
  candidates jsonb not null default '[]'::jsonb,
  match_rows jsonb not null default '[]'::jsonb,
  scan_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.website_import_sessions is
  'Server-side website crawl + image match state for bulk upload. Same-origin HTML crawl; candidates and per-artwork match rows stored as JSON for review UI.';

create index if not exists idx_website_import_sessions_user_updated
  on public.website_import_sessions (user_id, updated_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.website_import_sessions enable row level security;

drop policy if exists "website_import_sessions_select_own" on public.website_import_sessions;
create policy "website_import_sessions_select_own" on public.website_import_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "website_import_sessions_insert_own" on public.website_import_sessions;
create policy "website_import_sessions_insert_own" on public.website_import_sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "website_import_sessions_update_own" on public.website_import_sessions;
create policy "website_import_sessions_update_own" on public.website_import_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "website_import_sessions_delete_own" on public.website_import_sessions;
create policy "website_import_sessions_delete_own" on public.website_import_sessions
  for delete
  using (auth.uid() = user_id);
