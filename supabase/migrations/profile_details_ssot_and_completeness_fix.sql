-- P0 Root Fix: Profile details SSOT + stop completeness=0 clobber
-- Run in Supabase SQL Editor (SAME project as app).
-- 1) Backfill legacy profile_details table into profiles.profile_details
-- 2) upsert_profile_details write-through to profiles
-- 3) RPCs preserve existing completeness when p_completeness is NULL
--
-- If public.profile_details table does NOT exist, skip the backfill block below
-- (comment it out or run from "1.2 upsert_profile_details" onward).

-- ---------------------------------------------------------------------------
-- 1.1 Backfill legacy profile_details table into profiles.profile_details
-- ---------------------------------------------------------------------------
with legacy as (
  select
    user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'career_stage', career_stage,
      'age_band', age_band,
      'city', city,
      'region', region,
      'country', country,
      'themes', to_jsonb(themes),
      'keywords', to_jsonb(keywords),
      'mediums', to_jsonb(mediums),
      'styles', to_jsonb(styles),
      'collector_price_band', collector_price_band,
      'collector_acquisition_channels', to_jsonb(collector_acquisition_channels),
      'affiliation', affiliation,
      'program_focus', to_jsonb(program_focus)
    )) as details_json
  from public.profile_details
)
update public.profiles p
set profile_details =
  jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || l.details_json),
  updated_at = now(),
  profile_updated_at = now()
from legacy l
where p.id = l.user_id;

-- ---------------------------------------------------------------------------
-- 1.2 upsert_profile_details: write-through into profiles.profile_details (SSOT)
-- Keeps legacy table row touched; merges payload into profiles.profile_details
-- ---------------------------------------------------------------------------
create or replace function public.upsert_profile_details(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Legacy table: ensure row exists (optional; do not overwrite columns)
  insert into public.profile_details (user_id, updated_at)
  values (v_uid, now())
  on conflict (user_id) do update set updated_at = now();

  -- Write-through: merge into profiles.profile_details (SSOT)
  update public.profiles pr
  set
    profile_details = jsonb_strip_nulls(coalesce(pr.profile_details, '{}'::jsonb) || coalesce(p, '{}'::jsonb)),
    updated_at = now(),
    profile_updated_at = now()
  where pr.id = v_uid;

  select to_jsonb(pr.*) into v_row from public.profiles pr where pr.id = v_uid;
  return coalesce(v_row, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1.3 update_my_profile_base: preserve existing completeness when p_completeness is NULL
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile_base(p_patch jsonb, p_completeness int)
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  insert into public.profiles as p (
    id,
    display_name, bio, location, website, avatar_url,
    is_public, main_role, roles, education,
    profile_completeness, profile_details,
    profile_updated_at, updated_at
  )
  values (
    v_uid,
    nullif(trim(p_patch->>'display_name'), ''),
    nullif(trim(p_patch->>'bio'), ''),
    nullif(trim(p_patch->>'location'), ''),
    nullif(trim(p_patch->>'website'), ''),
    nullif(trim(p_patch->>'avatar_url'), ''),
    case when (p_patch ? 'is_public') then (p_patch->>'is_public')::boolean else true end,
    nullif(trim(p_patch->>'main_role'), ''),
    case when (p_patch ? 'roles') and jsonb_typeof(p_patch->'roles') = 'array' then
      (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(p_patch->'roles') as x)
    else '{}'::text[] end,
    case when (p_patch ? 'education') then (p_patch->'education') else null end,
    p_completeness,
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do update
  set
    display_name = coalesce(nullif(trim(excluded.display_name), ''), p.display_name),
    bio          = coalesce(nullif(trim(excluded.bio), ''), p.bio),
    location     = coalesce(nullif(trim(excluded.location), ''), p.location),
    website      = case when (p_patch ? 'website') then nullif(trim(p_patch->>'website'), '') else p.website end,
    avatar_url   = case when (p_patch ? 'avatar_url') then nullif(trim(p_patch->>'avatar_url'), '') else p.avatar_url end,
    is_public    = case when (p_patch ? 'is_public') then (p_patch->>'is_public')::boolean else p.is_public end,
    main_role    = case when (p_patch ? 'main_role') then nullif(trim(p_patch->>'main_role'), '') else p.main_role end,
    roles        = case when (p_patch ? 'roles') and jsonb_typeof(p_patch->'roles') = 'array' then
                    (select coalesce(array_agg(x), p.roles) from jsonb_array_elements_text(p_patch->'roles') as x)
                  else p.roles end,
    education    = case when (p_patch ? 'education') then (p_patch->'education') else p.education end,
    profile_completeness = case when p_completeness is null then p.profile_completeness else p_completeness end,
    profile_updated_at = now(),
    updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1.4 update_my_profile_details: preserve existing completeness when NULL
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile_details(p_details jsonb, p_completeness int)
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  insert into public.profiles as p (
    id, profile_details, profile_completeness, profile_updated_at, updated_at
  )
  values (
    v_uid,
    jsonb_strip_nulls(coalesce(p_details, '{}'::jsonb)),
    p_completeness,
    now(),
    now()
  )
  on conflict (id) do update
  set
    profile_details = jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb)),
    profile_completeness = case when p_completeness is null then p.profile_completeness else p_completeness end,
    profile_updated_at = now(),
    updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1.5 ensure_my_profile: do not overwrite completeness/details on conflict
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_profile()
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth.uid() is null'; end if;
  return query
  insert into public.profiles as p (id, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at)
  values (v_uid, true, '{}'::text[], 0, '{}'::jsonb, now(), now())
  on conflict (id) do update
  set updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.upsert_profile_details(jsonb) to anon, authenticated;
grant execute on function public.update_my_profile_base(jsonb, int) to anon, authenticated;
grant execute on function public.update_my_profile_details(jsonb, int) to anon, authenticated;
grant execute on function public.ensure_my_profile() to anon, authenticated;
