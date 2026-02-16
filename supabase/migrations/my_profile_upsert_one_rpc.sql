-- P0 Root Fix: Single-RPC transactional profile save (base + details + completeness)
-- Eliminates partial success + timeout confusion. Run in Supabase SQL Editor.

create or replace function public.upsert_my_profile(
  p_base jsonb,
  p_details jsonb,
  p_completeness int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;

  -- Ensure row exists (minimal insert for new users)
  insert into public.profiles (id, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at)
  values (v_uid, true, '{}'::text[], coalesce(p_completeness, 0), coalesce(p_details, '{}'::jsonb), now(), now())
  on conflict (id) do nothing;

  -- Update base + merge details + completeness in one transaction
  with updated as (
    update public.profiles p
    set
      display_name = case when (p_base ? 'display_name') then nullif(trim(p_base->>'display_name'), '') else p.display_name end,
      bio = case when (p_base ? 'bio') then nullif(trim(p_base->>'bio'), '') else p.bio end,
      location = case when (p_base ? 'location') then nullif(trim(p_base->>'location'), '') else p.location end,
      website = case when (p_base ? 'website') then nullif(trim(p_base->>'website'), '') else p.website end,
      avatar_url = case when (p_base ? 'avatar_url') then nullif(trim(p_base->>'avatar_url'), '') else p.avatar_url end,
      is_public = case when (p_base ? 'is_public') then coalesce((p_base->>'is_public')::boolean, p.is_public) else p.is_public end,
      main_role = case when (p_base ? 'main_role') then nullif(trim(p_base->>'main_role'), '') else p.main_role end,
      roles = case when (p_base ? 'roles') and jsonb_typeof(p_base->'roles') = 'array' then
        (select coalesce(array_agg(x), p.roles) from jsonb_array_elements_text(p_base->'roles') as x)
      else p.roles end,
      education = case when (p_base ? 'education') then (p_base->'education') else p.education end,
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

  return v_row;
end;
$$;

grant execute on function public.upsert_my_profile(jsonb, jsonb, int) to anon, authenticated;
