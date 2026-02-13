-- Run this in Supabase SQL Editor.
-- Table: artwork_likes

create table if not exists artwork_likes (
  artwork_id uuid not null references artworks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (artwork_id, user_id)
);

alter table artwork_likes enable row level security;

-- RLS policies
create policy "Allow read artwork_likes"
  on artwork_likes for select
  using (true);

create policy "Allow insert own like"
  on artwork_likes for insert
  with check (auth.uid() = user_id);

create policy "Allow delete own like"
  on artwork_likes for delete
  using (auth.uid() = user_id);
