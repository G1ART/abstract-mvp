-- Monetization Spine — usage_events: unified metering substrate.
--
-- Every quota-bearing capability writes a row here. The resolver reads the
-- same table to decide `near_limit` / `quota_exceeded`. A single shape
-- lets us swap in richer analytics later (e.g., Timescale) without
-- refactoring call sites.
--
-- Relation to existing tables:
--   beta_analytics_events  — keeps product-event firehose (UX analytics).
--   ai_events              — keeps AI cost / latency observability.
--   usage_events           — authoritative meter for billing + gating.
-- Some feature paths dual-write into beta_analytics_events to preserve
-- product dashboards while usage_events becomes the monetization spine.
--
-- RLS: insert/select own rows only. The resolver (client) relies on this —
-- a free-tier user should be able to see their own quota usage but never
-- anyone else's.

begin;

create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid null,
  feature_key text null,
  event_key text not null,
  value_int integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  client_ts timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_feature_idx
  on public.usage_events (user_id, feature_key, created_at desc);

create index if not exists usage_events_user_event_idx
  on public.usage_events (user_id, event_key, created_at desc);

create index if not exists usage_events_workspace_idx
  on public.usage_events (workspace_id, created_at desc)
  where workspace_id is not null;

alter table public.usage_events enable row level security;

drop policy if exists usage_events_insert_own on public.usage_events;
create policy usage_events_insert_own
  on public.usage_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own
  on public.usage_events
  for select
  using (auth.uid() = user_id);

grant select, insert on public.usage_events to authenticated;
grant usage, select on sequence public.usage_events_id_seq to authenticated;

comment on table public.usage_events is
  'Authoritative metering substrate for quota enforcement and future billing. One row per metered action.';
comment on column public.usage_events.event_key is
  'Dot-namespaced event identifier (e.g. ai.bio_assist.generated, board.created, connection.message_sent).';
comment on column public.usage_events.feature_key is
  'Optional canonical feature key (src/lib/entitlements/featureKeys.ts) the event counts against.';
comment on column public.usage_events.value_int is
  'Numeric contribution toward quota. 1 for simple counters; higher values for batched operations.';

commit;
