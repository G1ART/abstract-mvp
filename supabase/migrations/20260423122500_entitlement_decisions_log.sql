-- Monetization Spine — entitlement_decisions: resolver audit sample.
--
-- Optional sampling sink the resolver can write to when
-- NEXT_PUBLIC_ENTITLEMENTS_AUDIT=1 is set. Helps reconstruct, after-the-fact,
-- why a specific user saw a paywall (beta override? quota exceeded? which
-- plan was folded in?). Low volume by design — the product can always opt
-- to down-sample.

begin;

create table if not exists public.entitlement_decisions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  allowed boolean not null,
  source text not null,
  ui_state text not null,
  plan_key text not null,
  quota jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists entitlement_decisions_user_idx
  on public.entitlement_decisions (user_id, created_at desc);
create index if not exists entitlement_decisions_feature_idx
  on public.entitlement_decisions (feature_key, created_at desc);

alter table public.entitlement_decisions enable row level security;

drop policy if exists entitlement_decisions_insert_own on public.entitlement_decisions;
create policy entitlement_decisions_insert_own
  on public.entitlement_decisions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists entitlement_decisions_select_own on public.entitlement_decisions;
create policy entitlement_decisions_select_own
  on public.entitlement_decisions
  for select
  using (auth.uid() = user_id);

grant select, insert on public.entitlement_decisions to authenticated;
grant usage, select on sequence public.entitlement_decisions_id_seq to authenticated;

comment on table public.entitlement_decisions is
  'Sampled audit log of resolver decisions. Off by default; written only when NEXT_PUBLIC_ENTITLEMENTS_AUDIT=1.';

commit;
