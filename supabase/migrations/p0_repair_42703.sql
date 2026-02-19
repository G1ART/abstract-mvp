-- One-time repair for 42703 (undefined_column): ensure columns exist and fix artist resolver.
-- Run this in Supabase SQL Editor if price_inquiries or claims still return 400 with error=42703.

-- 1) Columns that may be missing in older DBs
alter table public.artworks add column if not exists artist_id uuid references public.profiles(id) on delete set null;
alter table public.claims add column if not exists status text not null default 'confirmed';
alter table public.notifications add column if not exists artwork_id uuid references public.artworks(id) on delete set null;
alter table public.notifications add column if not exists payload jsonb default '{}';

-- 2) Artist resolver for price_inquiries: only CREATED claim, no status column reference
create or replace function public.price_inquiry_artist_id(p_artwork_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select c.subject_profile_id
  from public.claims c
  where c.work_id = p_artwork_id and c.claim_type = 'CREATED'
  limit 1;
$$;

-- 3) Artist resolver for claims RLS (avoids recursion)
create or replace function public.artwork_artist_id(p_work_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select artist_id from public.artworks where id = p_work_id limit 1;
$$;
