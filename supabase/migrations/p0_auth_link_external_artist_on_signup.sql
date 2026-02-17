-- When a user signs up with email, link external_artists where invite_email matches.
-- Then migrate claims to use artist_profile_id, update artworks.artist_id so works
-- appear in feed and profile by persona.

create or replace function public.handle_auth_user_created_link_external_artist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user_id uuid;
  v_ext_ids uuid[];
  v_work_ids uuid[];
begin
  v_user_id := new.id;
  v_email := coalesce(trim(new.email), '');
  if v_email = '' then
    return new;
  end if;

  -- 0) Ensure profile exists (claimed_profile_id FK)
  insert into public.profiles (id, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at)
  values (v_user_id, true, '{}'::text[], 0, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  -- 1) Link external_artists where invite_email matches (case-insensitive)
  update public.external_artists
  set claimed_profile_id = v_user_id, status = 'claimed'
  where lower(trim(invite_email)) = lower(v_email) and claimed_profile_id is null;

  -- 2) Get ids of external_artists we just claimed
  select array_agg(id) into v_ext_ids
  from public.external_artists
  where claimed_profile_id = v_user_id;

  if v_ext_ids is null or array_length(v_ext_ids, 1) is null then
    return new;
  end if;

  -- 3) Capture work_ids before migrating claims (for artworks update)
  select array_agg(work_id) into v_work_ids
  from public.claims
  where external_artist_id = any(v_ext_ids) and work_id is not null;

  -- 4) Migrate claims: set artist_profile_id = v_user_id, external_artist_id = null
  update public.claims
  set artist_profile_id = v_user_id, external_artist_id = null
  where external_artist_id = any(v_ext_ids);

  -- 5) Update artworks.artist_id so works appear in feed/profile by artist
  if v_work_ids is not null and array_length(v_work_ids, 1) > 0 then
    update public.artworks
    set artist_id = v_user_id
    where id = any(v_work_ids);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_external_artist on auth.users;
create trigger on_auth_user_created_link_external_artist
  after insert on auth.users
  for each row execute function public.handle_auth_user_created_link_external_artist();
