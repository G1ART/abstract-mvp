/*
Fixes:
1) username NOT NULL violation on profiles insert paths
2) PostgREST 42804 due to legacy RPC overload / return mismatch

Approach:
- Drop the exact RPC signatures first to remove overload ambiguity.
- Recreate with schema-correct logic:
  - Always ensure profiles row exists with a non-null username.
  - If username missing, generate deterministic fallback: 'user_' + first 8 of uuid.
  - Return types match table: username text, profile_completeness smallint, profile_details jsonb.
  - If auth.uid() is null -> raise exception (prevents anon/HeadlessChrome calls from mutating data).
*/

-- 1) DROP old signatures to remove overload ambiguity
drop function if exists public.update_my_profile_base(jsonb, integer);
drop function if exists public.update_my_profile_details(jsonb, integer);

-- 2) Helper: ensure profile row exists AND username non-null
create or replace function public.ensure_profile_row()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_username := 'user_' || substring(v_uid::text from 1 for 8);

  -- Create row if missing (username forced)
  insert into public.profiles as p (
    id, username, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at
  )
  values (
    v_uid, v_username, true, '{}'::text[], 0::smallint, '{}'::jsonb, now(), now()
  )
  on conflict (id) do update
  set
    username = coalesce(p.username, excluded.username),
    updated_at = now();

  -- Also if a row exists but username somehow null, repair it
  update public.profiles p
  set username = v_username
  where p.id = v_uid and p.username is null;
end;
$$;

grant execute on function public.ensure_profile_row() to authenticated;

-- 3) Recreate update_my_profile_base
create or replace function public.update_my_profile_base(
  p_patch jsonb,
  p_completeness integer
)
returns table (
  id uuid,
  username text,
  profile_completeness smallint,
  profile_details jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_score smallint := null;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_profile_row();

  if p_completeness is not null then
    v_score := p_completeness::smallint;
  end if;

  return query
  update public.profiles p
  set
    display_name = case when (p_patch ? 'display_name') then nullif(trim(p_patch->>'display_name'), '') else p.display_name end,
    bio          = case when (p_patch ? 'bio') then nullif(trim(p_patch->>'bio'), '') else p.bio end,
    location     = case when (p_patch ? 'location') then nullif(trim(p_patch->>'location'), '') else p.location end,
    website      = case when (p_patch ? 'website') then nullif(trim(p_patch->>'website'), '') else p.website end,
    avatar_url   = case when (p_patch ? 'avatar_url') then nullif(trim(p_patch->>'avatar_url'), '') else p.avatar_url end,
    is_public    = case when (p_patch ? 'is_public') then (p_patch->>'is_public')::boolean else p.is_public end,
    main_role    = case when (p_patch ? 'main_role') then nullif(trim(p_patch->>'main_role'), '') else p.main_role end,
    roles        = case
                    when (p_patch ? 'roles') and jsonb_typeof(p_patch->'roles') = 'array' then
                      (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(p_patch->'roles') as x)
                    else p.roles
                  end,
    education    = case when (p_patch ? 'education') then (p_patch->'education') else p.education end,
    profile_completeness = coalesce(v_score, p.profile_completeness),
    profile_updated_at = now(),
    updated_at = now()
  where p.id = v_uid
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.update_my_profile_base(jsonb, integer) to authenticated;

-- 4) Recreate update_my_profile_details
create or replace function public.update_my_profile_details(
  p_details jsonb,
  p_completeness integer
)
returns table (
  id uuid,
  username text,
  profile_completeness smallint,
  profile_details jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_score smallint := null;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_profile_row();

  if p_completeness is not null then
    v_score := p_completeness::smallint;
  end if;

  return query
  update public.profiles p
  set
    profile_details = jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb)),
    profile_completeness = coalesce(v_score, p.profile_completeness),
    profile_updated_at = now(),
    updated_at = now()
  where p.id = v_uid
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.update_my_profile_details(jsonb, integer) to authenticated;
