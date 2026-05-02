-- Public Profile CV exposure: extend lookup_profile_by_username() to include
-- education / exhibitions / awards / residencies jsonb arrays so the public
-- profile can render the CV modal without a second round-trip.
--
-- Behavior preserved exactly from
--   supabase/migrations/20260430000200_lookup_profile_identity.sql
-- (private profile short-circuits to {is_public:false}; studio_portfolio
-- still exposed; identity columns still exposed). Only addition: the four
-- CV jsonb arrays on the public response object.

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
         artist_statement_hero_image_url, artist_statement_updated_at,
         education, exhibitions, awards, residencies
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
      'artist_statement_updated_at', rec.artist_statement_updated_at,
      'education', coalesce(rec.education, '[]'::jsonb),
      'exhibitions_cv', coalesce(rec.exhibitions, '[]'::jsonb),
      'awards', coalesce(rec.awards, '[]'::jsonb),
      'residencies', coalesce(rec.residencies, '[]'::jsonb)
    );
  else
    return jsonb_build_object('is_public', false);
  end if;
end;
$$;
