-- Profile v0 fields for relevancy/completeness.
-- Run in Supabase SQL Editor.

-- Add columns (if not exist)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='career_stage') then
    alter table public.profiles add column career_stage text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='age_band') then
    alter table public.profiles add column age_band text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='city') then
    alter table public.profiles add column city text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='region') then
    alter table public.profiles add column region text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='country') then
    alter table public.profiles add column country text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='themes') then
    alter table public.profiles add column themes text[] not null default '{}'::text[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='mediums') then
    alter table public.profiles add column mediums text[] not null default '{}'::text[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='styles') then
    alter table public.profiles add column styles text[] not null default '{}'::text[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='keywords') then
    alter table public.profiles add column keywords text[] not null default '{}'::text[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='education') then
    alter table public.profiles add column education jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='residencies') then
    alter table public.profiles add column residencies jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='exhibitions') then
    alter table public.profiles add column exhibitions jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='awards') then
    alter table public.profiles add column awards jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='profile_completeness') then
    alter table public.profiles add column profile_completeness smallint not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='profile_updated_at') then
    alter table public.profiles add column profile_updated_at timestamptz not null default now();
  end if;
end
$$;

-- Indexes (if not exist)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='created_at') then
    create index if not exists idx_profiles_is_public_created_at on public.profiles(is_public, created_at desc);
  end if;
end
$$;
create index if not exists idx_profiles_themes on public.profiles using gin (themes);
create index if not exists idx_profiles_mediums on public.profiles using gin (mediums);
create index if not exists idx_profiles_styles on public.profiles using gin (styles);
create index if not exists idx_profiles_city on public.profiles(city) where city is not null;
