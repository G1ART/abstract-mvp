-- P0: Fix 42804 "CASE types main_role and text cannot be matched".
-- profiles.main_role is enum; RPC used p_base->>'main_role' (text) in CASE without casting.
-- Cast text -> enum. If your enum type is not public.main_role, run schema check first:
--   select column_name, udt_name from information_schema.columns
--   where table_schema='public' and table_name='profiles' and column_name='main_role';

-- 1) upsert_my_profile: cast main_role text to enum
create or replace function public.upsert_my_profile(
  p_base jsonb,
  p_details jsonb,
  p_completeness int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_username text;
  v_main_role text;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;

  v_username := case
    when (p_base ? 'username') and nullif(trim(lower(p_base->>'username')), '') is not null
    then nullif(trim(lower(p_base->>'username')), '')
    else null
  end;

  v_main_role := nullif(trim(coalesce(p_base->>'main_role', '')), '');

  insert into public.profiles (id, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at)
  values (v_uid, true, '{}'::text[], coalesce(p_completeness, 0), coalesce(p_details, '{}'::jsonb), now(), now())
  on conflict (id) do nothing;

  with updated as (
    update public.profiles p
    set
      display_name = case when (p_base ? 'display_name') then nullif(trim(p_base->>'display_name'), '') else p.display_name end,
      bio          = case when (p_base ? 'bio') then nullif(trim(p_base->>'bio'), '') else p.bio end,
      location     = case when (p_base ? 'location') then nullif(trim(p_base->>'location'), '') else p.location end,
      website      = case when (p_base ? 'website') then nullif(trim(p_base->>'website'), '') else p.website end,
      avatar_url   = case when (p_base ? 'avatar_url') then nullif(trim(p_base->>'avatar_url'), '') else p.avatar_url end,
      is_public    = case when (p_base ? 'is_public') then coalesce((p_base->>'is_public')::boolean, p.is_public) else p.is_public end,
      main_role    = case when v_main_role is not null then v_main_role::public.main_role else p.main_role end,
      roles        = case when (p_base ? 'roles') and jsonb_typeof(p_base->'roles') = 'array' then
                      (select coalesce(array_agg(x), p.roles) from jsonb_array_elements_text(p_base->'roles') as x)
                    else p.roles end,
      education    = case when (p_base ? 'education') then (p_base->'education') else p.education end,
      username     = coalesce(v_username, p.username),
      profile_details = jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb)),
      profile_completeness = coalesce(p_completeness, p.profile_completeness),
      profile_updated_at = now(),
      updated_at = now()
    where p.id = v_uid
    returning to_jsonb(p.*) as j
  )
  select j into v_row from updated;

  if v_row is null then
    select to_jsonb(p.*) into v_row from public.profiles p where p.id = v_uid;
  end if;

  return coalesce(v_row, '{}'::jsonb);
end;
$$;

grant execute on function public.upsert_my_profile(jsonb, jsonb, int) to authenticated;

-- 2) update_my_profile_base: cast main_role text to enum
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
  v_main_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.ensure_profile_row();

  if p_completeness is not null then
    v_score := p_completeness::smallint;
  end if;

  v_main_role := nullif(trim(coalesce(p_patch->>'main_role', '')), '');

  return query
  update public.profiles p
  set
    display_name = case when (p_patch ? 'display_name') then nullif(trim(p_patch->>'display_name'), '') else p.display_name end,
    bio          = case when (p_patch ? 'bio') then nullif(trim(p_patch->>'bio'), '') else p.bio end,
    location     = case when (p_patch ? 'location') then nullif(trim(p_patch->>'location'), '') else p.location end,
    website      = case when (p_patch ? 'website') then nullif(trim(p_patch->>'website'), '') else p.website end,
    avatar_url   = case when (p_patch ? 'avatar_url') then nullif(trim(p_patch->>'avatar_url'), '') else p.avatar_url end,
    is_public    = case when (p_patch ? 'is_public') then (p_patch->>'is_public')::boolean else p.is_public end,
    main_role    = case when v_main_role is not null then v_main_role::public.main_role else p.main_role end,
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
