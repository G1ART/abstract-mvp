-- Profile details (1:1 with auth.users). Normalized from profiles to avoid type/casting issues.
-- Run in Supabase SQL Editor.

create table if not exists public.profile_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  career_stage text null,
  age_band text null,
  city text null,
  region text null,
  country text null,
  themes text[] null,
  keywords text[] null,
  mediums text[] null,
  styles text[] null,
  collector_price_band text null,
  collector_acquisition_channels text[] null,
  affiliation text null,
  program_focus text[] null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profile_details_themes on public.profile_details using gin (themes) where themes is not null;
create index if not exists idx_profile_details_mediums on public.profile_details using gin (mediums) where mediums is not null;
create index if not exists idx_profile_details_styles on public.profile_details using gin (styles) where styles is not null;
create index if not exists idx_profile_details_program_focus on public.profile_details using gin (program_focus) where program_focus is not null;
create index if not exists idx_profile_details_collector_channels on public.profile_details using gin (collector_acquisition_channels) where collector_acquisition_channels is not null;

create or replace function public.set_profile_details_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_details_updated_at on public.profile_details;
create trigger profile_details_updated_at
  before update on public.profile_details
  for each row execute function public.set_profile_details_updated_at();

alter table public.profile_details enable row level security;

drop policy if exists profile_details_select_self on public.profile_details;
create policy profile_details_select_self on public.profile_details
  for select using (auth.uid() = user_id);

drop policy if exists profile_details_insert_self on public.profile_details;
create policy profile_details_insert_self on public.profile_details
  for insert with check (auth.uid() = user_id);

drop policy if exists profile_details_update_self on public.profile_details;
create policy profile_details_update_self on public.profile_details
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RPC: single upsert so client does not deal with casting.
create or replace function public.upsert_profile_details(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_career_stage text;
  v_age_band text;
  v_city text;
  v_region text;
  v_country text;
  v_themes text[];
  v_keywords text[];
  v_mediums text[];
  v_styles text[];
  v_collector_price_band text;
  v_collector_acquisition_channels text[];
  v_affiliation text;
  v_program_focus text[];
  v_row jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  v_career_stage := nullif(trim((p->>'career_stage')::text), '');
  v_age_band := nullif(trim((p->>'age_band')::text), '');
  v_city := nullif(trim((p->>'city')::text), '');
  v_region := nullif(trim((p->>'region')::text), '');
  v_country := nullif(trim((p->>'country')::text), '');
  v_collector_price_band := nullif(trim((p->>'collector_price_band')::text), '');
  v_affiliation := nullif(trim((p->>'affiliation')::text), '');

  if p->'themes' is not null and jsonb_typeof(p->'themes') = 'array' then
    select array_agg(x) into v_themes from jsonb_array_elements_text(p->'themes') as x;
  else
    v_themes := null;
  end if;

  if p->'keywords' is not null and jsonb_typeof(p->'keywords') = 'array' then
    select array_agg(x) into v_keywords from jsonb_array_elements_text(p->'keywords') as x;
  else
    v_keywords := null;
  end if;

  if p->'mediums' is not null and jsonb_typeof(p->'mediums') = 'array' then
    select array_agg(x) into v_mediums from jsonb_array_elements_text(p->'mediums') as x;
  else
    v_mediums := null;
  end if;

  if p->'styles' is not null and jsonb_typeof(p->'styles') = 'array' then
    select array_agg(x) into v_styles from jsonb_array_elements_text(p->'styles') as x;
  else
    v_styles := null;
  end if;

  if p->'collector_acquisition_channels' is not null and jsonb_typeof(p->'collector_acquisition_channels') = 'array' then
    select array_agg(x) into v_collector_acquisition_channels from jsonb_array_elements_text(p->'collector_acquisition_channels') as x;
  else
    v_collector_acquisition_channels := null;
  end if;

  if p->'program_focus' is not null and jsonb_typeof(p->'program_focus') = 'array' then
    select array_agg(x) into v_program_focus from jsonb_array_elements_text(p->'program_focus') as x;
  else
    v_program_focus := null;
  end if;

  insert into public.profile_details (
    user_id, career_stage, age_band, city, region, country,
    themes, keywords, mediums, styles,
    collector_price_band, collector_acquisition_channels,
    affiliation, program_focus, updated_at
  ) values (
    v_uid, v_career_stage, v_age_band, v_city, v_region, v_country,
    v_themes, v_keywords, v_mediums, v_styles,
    v_collector_price_band, v_collector_acquisition_channels,
    v_affiliation, v_program_focus, now()
  )
  on conflict (user_id) do update set
    career_stage = excluded.career_stage,
    age_band = excluded.age_band,
    city = excluded.city,
    region = excluded.region,
    country = excluded.country,
    themes = excluded.themes,
    keywords = excluded.keywords,
    mediums = excluded.mediums,
    styles = excluded.styles,
    collector_price_band = excluded.collector_price_band,
    collector_acquisition_channels = excluded.collector_acquisition_channels,
    affiliation = excluded.affiliation,
    program_focus = excluded.program_focus,
    updated_at = now();

  select to_jsonb(r) into v_row
  from public.profile_details r
  where r.user_id = v_uid;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

grant execute on function public.upsert_profile_details(jsonb) to authenticated;
