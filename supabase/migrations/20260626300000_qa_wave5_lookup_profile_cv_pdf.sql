-- QA 2026-06-26 (Wave 5 #6) — expose cv_pdf_path on the public profile DTO.
--
-- The downloadable CV PDF column was added in 20260626100000
-- (`profiles.cv_pdf_path`). Public profile pages need it on the
-- `lookup_profile_by_username` payload so the artist's visitors can
-- get a one-click download link without a second round-trip.
--
-- Side-effect (intentional): also restores `viewer_follow_status` to
-- both branches. The 20260601400000 CV migration rewrote the function
-- and accidentally dropped the field added in 20260511000000, so the
-- Follow button on the private-profile card had been falling back to
-- "none" for all viewers. We resurrect the v_status computation here
-- (identical logic to 20260511000000) so the public DTO stays
-- backward-compatible with the TS callers that already read it
-- (PrivateProfileShell at L241).

create or replace function public.lookup_profile_by_username(p_username text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $a$
declare
  rec record;
  sp jsonb;
  v_uid uuid := auth.uid();
  v_status text := 'none';
begin
  select id, username, display_name, main_role, avatar_url, is_public,
         bio, location, website, roles, profile_details,
         cover_image_url, cover_image_position_y, artist_statement,
         artist_statement_hero_image_url, artist_statement_updated_at,
         education, exhibitions, awards, residencies, cv_pdf_path
    into rec
    from profiles
   where lower(username) = lower(trim(p_username))
   limit 1;

  if not found then
    return null;
  end if;

  if v_uid is not null and v_uid <> rec.id then
    select status into v_status
      from public.follows
     where follower_id = v_uid
       and following_id = rec.id
     limit 1;
    v_status := coalesce(v_status, 'none');
  end if;

  if rec.is_public = true then
    sp := null;
    if rec.profile_details is not null
       and jsonb_typeof(rec.profile_details) = 'object' then
      sp := rec.profile_details->'studio_portfolio';
    end if;
    return jsonb_build_object(
      'id', rec.id,
      'username', rec.username,
      'display_name', rec.display_name,
      'main_role', rec.main_role,
      'avatar_url', rec.avatar_url,
      'bio', rec.bio,
      'location', rec.location,
      'website', rec.website,
      'roles', rec.roles,
      'is_public', true,
      'studio_portfolio', case when sp is null or jsonb_typeof(sp) = 'null' then null else sp end,
      'cover_image_url', rec.cover_image_url,
      'cover_image_position_y', rec.cover_image_position_y,
      'artist_statement', rec.artist_statement,
      'artist_statement_hero_image_url', rec.artist_statement_hero_image_url,
      'artist_statement_updated_at', rec.artist_statement_updated_at,
      'education', coalesce(rec.education, '[]'::jsonb),
      'exhibitions_cv', coalesce(rec.exhibitions, '[]'::jsonb),
      'awards', coalesce(rec.awards, '[]'::jsonb),
      'residencies', coalesce(rec.residencies, '[]'::jsonb),
      'cv_pdf_path', rec.cv_pdf_path,
      'viewer_follow_status', v_status
    );
  else
    return jsonb_build_object(
      'id', rec.id,
      'username', rec.username,
      'display_name', rec.display_name,
      'main_role', rec.main_role,
      'avatar_url', rec.avatar_url,
      'roles', rec.roles,
      'bio', rec.bio,
      'is_public', false,
      'viewer_follow_status', v_status
    );
  end if;
end;
$a$;

grant execute on function public.lookup_profile_by_username(text) to authenticated;
grant execute on function public.lookup_profile_by_username(text) to anon;
