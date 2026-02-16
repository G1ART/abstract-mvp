-- v5.5: Profile save guaranteed via UPSERT RPC
-- Handles: (a) profile row 없음, (b) profiles.id 불일치, (c) RLS update 차단
-- Run in Supabase SQL Editor

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
    coalesce(p_completeness, 0),
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
    profile_completeness = coalesce(p_completeness, p.profile_completeness),
    profile_updated_at = now(),
    updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

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
    coalesce(p_completeness, 0),
    now(),
    now()
  )
  on conflict (id) do update
  set
    profile_details = jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb)),
    profile_completeness = coalesce(p_completeness, p.profile_completeness),
    profile_updated_at = now(),
    updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.update_my_profile_base(jsonb, int) to anon, authenticated;
grant execute on function public.update_my_profile_details(jsonb, int) to anon, authenticated;
