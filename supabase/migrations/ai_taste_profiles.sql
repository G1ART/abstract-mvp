-- User taste profiles for AI recommendations.
-- Run in Supabase SQL Editor.
-- Requires: vector extension (from ai_embeddings.sql).

create table if not exists public.user_taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  taste_embedding vector(768) null,
  taste_updated_at timestamptz not null default now(),
  last_event_at timestamptz null,
  debug jsonb not null default '{}'::jsonb
);

alter table public.user_taste_profiles enable row level security;

create policy "Users select own taste profile"
  on public.user_taste_profiles for select
  using (auth.uid() = user_id);

create policy "Users insert own taste profile"
  on public.user_taste_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users update own taste profile"
  on public.user_taste_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own taste profile"
  on public.user_taste_profiles for delete
  using (auth.uid() = user_id);
