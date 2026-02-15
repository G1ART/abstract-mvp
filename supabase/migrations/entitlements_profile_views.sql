-- Entitlements (plan gating) + profile_views (view events).
-- Run in Supabase SQL Editor.
-- No payments: plan = free|artist_pro etc. for UX skeleton.

-- 1) entitlements
create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  valid_until timestamptz null,
  updated_at timestamptz default now()
);

alter table entitlements enable row level security;

create policy "Users select own entitlements"
  on entitlements for select
  using (auth.uid() = user_id);

create policy "Users update own entitlements"
  on entitlements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users insert own entitlements"
  on entitlements for insert
  with check (auth.uid() = user_id);

-- 2) profile_views
create table if not exists profile_views (
  id bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  viewer_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_profile_views_profile_created
  on profile_views(profile_id, created_at desc);

alter table profile_views enable row level security;

create policy "Anyone insert profile_views"
  on profile_views for insert
  with check (viewer_id = auth.uid() or viewer_id is null);

create policy "Profile owner select own views"
  on profile_views for select
  using (
    exists (select 1 from profiles p where p.id = profile_views.profile_id and p.id = auth.uid())
  );
