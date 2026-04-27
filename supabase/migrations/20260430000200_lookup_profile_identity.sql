-- P1-0: extend lookup_profile_by_username() with the five new identity columns.
--
-- Behavior preserved exactly from supabase/migrations/20260428000000_lookup_profile_studio_portfolio.sql:
--   * private profile short-circuits to {is_public:false}
--   * studio_portfolio slice from profile_details still exposed
-- Only addition: cover_image_url / cover_image_position_y / artist_statement /
-- artist_statement_hero_image_url / artist_statement_updated_at on the public
-- response object.

create or replace function public.lookup_profile_by_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  sp jsonb;
begin
  select id, username, display_name, main_role, avatar_url, is_public,
         bio, location, website, roles, profile_details,
         cover_image_url, cover_image_position_y, artist_statement,
         artist_statement_hero_image_url, artist_statement_updated_at
  into rec
  from profiles
  where lower(username) = lower(trim(p_username))
  limit 1;

  if not found then
    return null;
  end if;

  if rec.is_public = true then
    sp := null;
    if rec.profile_details is not null and jsonb_typeof(rec.profile_details) = 'object' then
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
      'artist_statement_updated_at', rec.artist_statement_updated_at
    );
  else
    return jsonb_build_object('is_public', false);
  end if;
end;
$$;
