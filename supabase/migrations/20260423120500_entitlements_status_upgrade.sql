-- Monetization Spine — entitlements table upgrade.
--
-- Evolves `public.entitlements` so it can represent the full subscription
-- lifecycle once Stripe lands. Today `BETA_ALL_PAID=true` so every row
-- stays logically on the free tier while UI grants pro capabilities; the
-- new `status='beta_all_paid'` value makes that state explicit in the DB
-- for later audits.
--
-- `plan_source` documents how a row got its current plan (beta override,
-- Stripe subscription, manual comp, admin override) — crucial for future
-- reconciliation tooling.

begin;

-- 1. Drop any pre-existing status CHECK (there was none initially, but some
--    deployed environments may have added one via ad-hoc scripts).
alter table public.entitlements
  drop constraint if exists entitlements_status_check;

-- 2. Add lifecycle columns.
alter table public.entitlements
  add column if not exists plan_source text;
alter table public.entitlements
  add column if not exists trial_ends_at timestamptz;

-- 3. Backfill: default plan_source for existing rows is 'beta_override'
--    since the entire current dataset was seeded under BETA_ALL_PAID.
update public.entitlements
   set plan_source = coalesce(plan_source, 'beta_override')
 where plan_source is null;

-- 4. Re-add a permissive CHECK that matches the canonical enum. We keep
--    'active' for backward compatibility with already-seeded rows and add
--    the expanded lifecycle values.
alter table public.entitlements
  add constraint entitlements_status_check
  check (status in ('free', 'active', 'past_due', 'canceled', 'grace', 'beta_all_paid'));

-- 5. Plan column CHECK aligning with canonical PlanKey taxonomy.
alter table public.entitlements
  drop constraint if exists entitlements_plan_check;

alter table public.entitlements
  add constraint entitlements_plan_check
  check (plan in ('free', 'artist_pro', 'discovery_pro', 'hybrid_pro', 'gallery_workspace', 'collector_pro'));

-- 6. Index for viewer-list RPC lookups (already joined on user_id PK, but
--    explicit for clarity).
create index if not exists entitlements_plan_idx
  on public.entitlements (plan);

comment on column public.entitlements.plan_source is
  'Provenance of the current plan value: beta_override | stripe | manual | comp';
comment on column public.entitlements.trial_ends_at is
  'When a trial grant expires and the row should revert to free.';

commit;
