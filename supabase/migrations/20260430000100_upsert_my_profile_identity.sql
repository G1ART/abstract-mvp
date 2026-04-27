-- P1-0: extend upsert_my_profile() to accept the five new identity columns.
--
-- This is a drop-in replacement of supabase/migrations/p0_profile_ssot_single_rpc.sql
-- with the cover/statement branches appended. All other branches are
-- byte-for-byte identical so the active SSOT save path keeps working.

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
begin
  if v_uid is null then
    raise exception 'auth.uid() is null';
  end if;

  -- Ensure row exists. If profiles.username is NOT NULL and has no default/trigger,
  -- this insert may fail for new users. Existing users will be fine.
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
      main_role    = case when (p_base ? 'main_role') then nullif(trim(p_base->>'main_role'), '') else p.main_role end,
      roles        = case when (p_base ? 'roles') and jsonb_typeof(p_base->'roles') = 'array' then
                      (select coalesce(array_agg(x), p.roles) from jsonb_array_elements_text(p_base->'roles') as x)
                    else p.roles end,
      education    = case when (p_base ? 'education') then (p_base->'education') else p.education end,
      -- optional: allow onboarding to set username via p_base
      username     = case when (p_base ? 'username') then nullif(trim(lower(p_base->>'username')), '') else p.username end,
      -- ── P1-0 identity columns (additive) ───────────────────────────────
      cover_image_url = case when (p_base ? 'cover_image_url')
        then nullif(trim(p_base->>'cover_image_url'), '')
        else p.cover_image_url end,
      cover_image_position_y = case when (p_base ? 'cover_image_position_y')
        then case
          when p_base->>'cover_image_position_y' is null then p.cover_image_position_y
          when (p_base->>'cover_image_position_y') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then greatest(0::numeric, least(100::numeric, (p_base->>'cover_image_position_y')::numeric))
          else p.cover_image_position_y
        end
        else p.cover_image_position_y end,
      artist_statement = case when (p_base ? 'artist_statement')
        then nullif(trim(p_base->>'artist_statement'), '')
        else p.artist_statement end,
      artist_statement_hero_image_url = case when (p_base ? 'artist_statement_hero_image_url')
        then nullif(trim(p_base->>'artist_statement_hero_image_url'), '')
        else p.artist_statement_hero_image_url end,
      -- Stamp statement edited-at whenever the artist_statement key was
      -- present in the patch (covers both write and clear).
      artist_statement_updated_at = case when (p_base ? 'artist_statement')
        then now()
        else p.artist_statement_updated_at end,
      -- merge details (never clobber existing keys unless overwritten)
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
