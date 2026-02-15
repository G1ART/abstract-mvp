-- AI embeddings for artworks (pgvector).
-- Run in Supabase SQL Editor.
-- Requires: create extension if not exists vector;

create extension if not exists vector;

create table if not exists public.artwork_embeddings (
  artwork_id uuid primary key references public.artworks(id) on delete cascade,
  image_embedding vector(768) null,
  text_embedding vector(768) null,
  embedding_model text null,
  image_hash text null,
  updated_at timestamptz not null default now()
);

alter table public.artwork_embeddings enable row level security;

-- SELECT: public artworks only (join artworks) or owner
create policy "Allow select artwork_embeddings for public artworks or owner"
  on public.artwork_embeddings for select
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_embeddings.artwork_id
        and (a.visibility = 'public' or a.artist_id = auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: owner only
create policy "Allow owner insert artwork_embeddings"
  on public.artwork_embeddings for insert
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_embeddings.artwork_id and a.artist_id = auth.uid()
    )
  );

create policy "Allow owner update artwork_embeddings"
  on public.artwork_embeddings for update
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_embeddings.artwork_id and a.artist_id = auth.uid()
    )
  );

create policy "Allow owner delete artwork_embeddings"
  on public.artwork_embeddings for delete
  using (
    exists (
      select 1 from public.artworks a
      where a.id = artwork_embeddings.artwork_id and a.artist_id = auth.uid()
    )
  );
