-- Collector/Curator persona fields for profile taxonomy.
-- Run in Supabase SQL Editor.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='price_band') then
    alter table public.profiles add column price_band text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='acquisition_channels') then
    alter table public.profiles add column acquisition_channels text[] not null default '{}'::text[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='affiliation') then
    alter table public.profiles add column affiliation text null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='program_focus') then
    alter table public.profiles add column program_focus text[] not null default '{}'::text[];
  end if;
end
$$;
