-- Exhibition-level media (전시전경 installation shots, 부대행사 side events).
-- Not linked to artworks; for curators/galleries to show exhibition vibe.
-- Design: docs/EXHIBITION_PROJECT_AND_MULTI_CLAIM_DESIGN.md

create table if not exists public.exhibition_media (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.projects(id) on delete cascade,
  type text not null check (type in ('installation', 'side_event')),
  storage_path text not null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_exhibition_media_exhibition_id on public.exhibition_media(exhibition_id);

comment on table public.exhibition_media is 'Photos/media for exhibition (installation views, side events). Not linked to artworks.';
comment on column public.exhibition_media.type is 'installation = 전시전경, side_event = 부대행사';

alter table public.exhibition_media enable row level security;

create policy exhibition_media_select on public.exhibition_media
  for select to public
  using (true);

create policy exhibition_media_insert on public.exhibition_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

create policy exhibition_media_update on public.exhibition_media
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

create policy exhibition_media_delete on public.exhibition_media
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

grant select, insert, update, delete on public.exhibition_media to authenticated;
grant select on public.exhibition_media to anon;
