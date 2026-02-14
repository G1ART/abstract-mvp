-- Extend lookup_profile_by_username to return bio, location, website, roles.
-- Run in Supabase SQL Editor if you haven't yet.

create or replace function lookup_profile_by_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  select id, username, display_name, main_role, avatar_url, is_public,
         bio, location, website, roles
  into rec
  from profiles
  where lower(username) = lower(trim(p_username))
  limit 1;

  if not found then
    return null;
  end if;

  if rec.is_public = true then
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
      'is_public', true
    );
  else
    return jsonb_build_object('is_public', false);
  end if;
end;
$$;
