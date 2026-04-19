-- AI-Native Studio Layer (Wave 1) — observability table.
--
-- Every AI generation call (profile copilot, portfolio copilot, studio digest,
-- bio draft, exhibition draft, inquiry reply draft, intro message draft,
-- matchmaker rationales) writes one row. We keep this separate from
-- `beta_analytics_events` so cost/latency analytics can be queried without
-- scanning the whole product event firehose.

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  feature_key text not null,
  context_size integer,
  model text,
  latency_ms integer,
  accepted boolean,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_events_user_created_idx
  on public.ai_events (user_id, created_at desc);

create index if not exists ai_events_feature_created_idx
  on public.ai_events (feature_key, created_at desc);

alter table public.ai_events enable row level security;

drop policy if exists ai_events_select_own on public.ai_events;
create policy ai_events_select_own
  on public.ai_events
  for select
  using (auth.uid() = user_id);

drop policy if exists ai_events_insert_own on public.ai_events;
create policy ai_events_insert_own
  on public.ai_events
  for insert
  with check (auth.uid() = user_id);

comment on table public.ai_events is
  'Observability rows for AI-Native Studio Layer (Wave 1). One row per OpenAI call.';
