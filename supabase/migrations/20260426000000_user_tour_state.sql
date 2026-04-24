-- Per-user guided tour progress.
--
-- The guided tour system persists progress per (user, tour). A tour can be
-- re-shown after a meaningful content change by bumping the tour's numeric
-- `version` in `src/lib/tours/tourRegistry.ts`; we compare the stored
-- `version` against the current one and auto-start only when they differ.
--
-- This migration is self-contained; the client layer also writes to
-- localStorage as a best-effort mirror so boot is instant and anonymous
-- users still get sensible once-only behavior during the beta.

create table if not exists public.user_tour_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  tour_id text not null,
  version int not null default 1,
  status text not null default 'not_seen'
    check (status in ('not_seen','in_progress','completed','skipped')),
  last_step int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, tour_id)
);

comment on table public.user_tour_state is
  'Per-user onboarding tour progress. Versioned via tour_id + version so a bumped tour can re-surface once to users who had previously dismissed the earlier revision.';

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.user_tour_state enable row level security;

drop policy if exists "tour_state_select_self" on public.user_tour_state;
create policy "tour_state_select_self" on public.user_tour_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "tour_state_insert_self" on public.user_tour_state;
create policy "tour_state_insert_self" on public.user_tour_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "tour_state_update_self" on public.user_tour_state;
create policy "tour_state_update_self" on public.user_tour_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tour_state_delete_self" on public.user_tour_state;
create policy "tour_state_delete_self" on public.user_tour_state
  for delete
  using (auth.uid() = user_id);

-- ─── Helpful index for debug queries / future admin summaries ──────────
create index if not exists idx_user_tour_state_tour_status
  on public.user_tour_state (tour_id, status);
