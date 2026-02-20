-- Persistent bucket metadata/order for exhibition media.
-- This enables bucket order to remain stable even when a bucket has zero images.

create table if not exists public.exhibition_media_buckets (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  title text not null,
  type text not null check (type in ('installation', 'side_event', 'custom')),
  sort_order int default 0,
  created_at timestamptz not null default now(),
  unique (exhibition_id, key)
);

create index if not exists idx_exhibition_media_buckets_exhibition_id
  on public.exhibition_media_buckets(exhibition_id);

comment on table public.exhibition_media_buckets is 'Bucket metadata/order for exhibition media sections.';
comment on column public.exhibition_media_buckets.key is 'Stable bucket key used by UI and media grouping.';

alter table public.exhibition_media_buckets enable row level security;

drop policy if exists exhibition_media_buckets_select on public.exhibition_media_buckets;
create policy exhibition_media_buckets_select on public.exhibition_media_buckets
  for select to public
  using (true);

drop policy if exists exhibition_media_buckets_insert on public.exhibition_media_buckets;
create policy exhibition_media_buckets_insert on public.exhibition_media_buckets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

drop policy if exists exhibition_media_buckets_update on public.exhibition_media_buckets;
create policy exhibition_media_buckets_update on public.exhibition_media_buckets
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

drop policy if exists exhibition_media_buckets_delete on public.exhibition_media_buckets;
create policy exhibition_media_buckets_delete on public.exhibition_media_buckets
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = exhibition_id
        and (p.curator_id = auth.uid() or p.host_profile_id = auth.uid())
    )
  );

grant select, insert, update, delete on public.exhibition_media_buckets to authenticated;
grant select on public.exhibition_media_buckets to anon;

-- Backfill known default buckets for all existing exhibitions.
insert into public.exhibition_media_buckets (exhibition_id, key, title, type, sort_order)
select p.id, 'installation', 'installation', 'installation', 0
from public.projects p
where p.project_type = 'exhibition'
on conflict (exhibition_id, key) do nothing;

insert into public.exhibition_media_buckets (exhibition_id, key, title, type, sort_order)
select p.id, 'side_event', 'side_event', 'side_event', 1
from public.projects p
where p.project_type = 'exhibition'
on conflict (exhibition_id, key) do nothing;

-- Backfill custom buckets inferred from existing media.
insert into public.exhibition_media_buckets (exhibition_id, key, title, type, sort_order)
select
  m.exhibition_id,
  coalesce(nullif(trim(m.bucket_title), ''), m.type) as key,
  coalesce(nullif(trim(m.bucket_title), ''), m.type) as title,
  case when m.type in ('installation', 'side_event') then m.type else 'custom' end as type,
  coalesce(min(m.sort_order), 2) as sort_order
from public.exhibition_media m
group by m.exhibition_id, coalesce(nullif(trim(m.bucket_title), ''), m.type), case when m.type in ('installation', 'side_event') then m.type else 'custom' end
on conflict (exhibition_id, key) do nothing;
