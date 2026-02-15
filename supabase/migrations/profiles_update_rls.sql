-- profiles RLS: ensure self UPDATE/INSERT/SELECT.
-- Run in Supabase SQL Editor if UPDATE is blocked.

alter table public.profiles enable row level security;

-- SELECT: allow self + public profiles (or adjust per your rules)
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (true);

-- INSERT: self only (onboarding creates own row)
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

-- UPDATE: self only
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
