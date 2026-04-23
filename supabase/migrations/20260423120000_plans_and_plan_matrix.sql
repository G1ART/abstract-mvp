-- Monetization Spine — Plans + plan↔feature matrix tables.
--
-- The `public.plans` table is the canonical register of subscription plans
-- that ever existed in the product. `plan_feature_matrix` mirrors the
-- TypeScript matrix in `src/lib/entitlements/planMatrix.ts`; the seed
-- migration (20260423123000) keeps the two in sync via idempotent upserts.
--
-- DB-level gates (SECURITY DEFINER RPCs) may read from these tables when
-- they need to block reveal operations regardless of client-side code.
--
-- RLS: read-all for `authenticated` (these are non-sensitive product
-- metadata); writes are owned by `service_role` only — the seed runs as
-- the Supabase admin connection.

begin;

create table if not exists public.plans (
  plan_key text primary key,
  display_name text not null,
  description text,
  seats_default integer not null default 1,
  is_seat_plan boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_feature_matrix (
  plan_key text not null references public.plans(plan_key) on delete cascade,
  feature_key text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (plan_key, feature_key)
);

create index if not exists plan_feature_matrix_feature_idx
  on public.plan_feature_matrix (feature_key);

create table if not exists public.plan_quota_matrix (
  plan_key text not null references public.plans(plan_key) on delete cascade,
  feature_key text not null,
  quota_limit integer,
  quota_window_days integer not null default 30,
  count_event_keys text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  primary key (plan_key, feature_key)
);

create index if not exists plan_quota_matrix_feature_idx
  on public.plan_quota_matrix (feature_key);

alter table public.plans enable row level security;
alter table public.plan_feature_matrix enable row level security;
alter table public.plan_quota_matrix enable row level security;

drop policy if exists plans_select_all on public.plans;
create policy plans_select_all on public.plans
  for select using (true);

drop policy if exists plan_feature_matrix_select_all on public.plan_feature_matrix;
create policy plan_feature_matrix_select_all on public.plan_feature_matrix
  for select using (true);

drop policy if exists plan_quota_matrix_select_all on public.plan_quota_matrix;
create policy plan_quota_matrix_select_all on public.plan_quota_matrix
  for select using (true);

comment on table public.plans is
  'Canonical registry of subscription plans. Mirrors src/lib/entitlements/planMatrix.ts.';
comment on table public.plan_feature_matrix is
  'plan_key x feature_key allow-list. Seeded from TypeScript matrix.';
comment on table public.plan_quota_matrix is
  'Per-plan per-feature rolling-window quotas.';

commit;
