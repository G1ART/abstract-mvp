-- Search enhancement: pg_trgm for typo-tolerant name search + search_artists_by_artwork for theme/artwork.
-- Run in Supabase SQL Editor if migrations are not auto-applied.

create extension if not exists pg_trgm;

-- Optional: GIN trigram indexes for faster fuzzy search on profiles (skip if tables are small).
create index if not exists idx_profiles_username_gin_trgm on profiles using gin (username gin_trgm_ops);
create index if not exists idx_profiles_display_name_gin_trgm on profiles using gin (display_name gin_trgm_ops);

-- search_people: add fuzzy (similarity) when cursor is null; limit 40 for fuzzy path; no cursor for fuzzy.
create or replace function search_people(
  p_q text,
  p_roles text[] default '{}',
  p_limit int default 15,
  p_cursor text default null
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_q, ''));
  v_pattern text;
  v_cursor_id uuid;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int;
  v_use_fuzzy boolean := false;
begin
  if v_q = '' then
    return;
  end if;
  v_pattern := '%' || lower(v_q) || '%';
  v_limit := least(greatest(coalesce(p_limit, 15), 1), 50);
  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
  else
    v_cursor_id := null;
  end if;
  -- When no cursor and query length >= 2, use fuzzy (similarity) and cap at 40.
  if v_cursor_id is null and length(v_q) >= 2 then
    v_use_fuzzy := true;
    v_limit := least(v_limit, 40);
  end if;

  if v_use_fuzzy then
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public, 'reason', 'search',
      'match_rank', (case when (p.username ilike v_pattern or p.display_name ilike v_pattern) then 0 else 1 end)
    )
    from profiles p
    where p.is_public = true
      and (
        p.username ilike v_pattern or p.display_name ilike v_pattern
        or similarity(coalesce(p.username, ''), v_q) > 0.2
        or similarity(coalesce(p.display_name, ''), v_q) > 0.2
      )
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
    order by
      (case when (p.username ilike v_pattern or p.display_name ilike v_pattern) then 0 else 1 end),
      greatest(
        similarity(coalesce(p.display_name, ''), v_q),
        similarity(coalesce(p.username, ''), v_q)
      ) desc nulls last,
      p.id desc
    limit v_limit;
  else
    return query
    select jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
      'roles', p.roles, 'is_public', p.is_public, 'reason', 'search',
      'match_rank', 0
    )
    from profiles p
    where p.is_public = true
      and (p.username ilike v_pattern or p.display_name ilike v_pattern)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by p.id desc
    limit v_limit;
  end if;
end;
$$;

-- Search artists by artwork title/medium/story (theme). Returns same profile jsonb shape as search_people.
create or replace function search_artists_by_artwork(
  p_q text,
  p_roles text[] default '{}',
  p_limit int default 20
)
returns setof jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_q, ''));
  v_pattern text;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_q) < 1 then
    return;
  end if;
  v_pattern := '%' || lower(v_q) || '%';

  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public, 'reason', 'artwork',
    'match_rank', 2
  )
  from profiles p
  where p.is_public = true
    and p.id in (
      select distinct a.artist_id
      from artworks a
      where a.visibility = 'public'
        and (
          a.title ilike v_pattern
          or a.medium ilike v_pattern
          or a.story ilike v_pattern
          or (length(v_q) >= 2 and (
            similarity(coalesce(a.title, ''), v_q) > 0.15
            or similarity(coalesce(a.medium, ''), v_q) > 0.15
            or similarity(coalesce(a.story, ''), v_q) > 0.15
          ))
        )
    )
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
  order by p.display_name nulls last, p.id
  limit v_limit;
end;
$$;

grant execute on function public.search_artists_by_artwork(text, text[], int) to authenticated;
grant execute on function public.search_artists_by_artwork(text, text[], int) to anon;

-- Suggestion for "Did you mean?" when search returns few or no results.
create or replace function get_search_suggestion(p_q text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_q, ''));
  v_best_profile record;
  v_best_artwork record;
  v_sim_p float;
  v_sim_a float;
begin
  if length(v_q) < 2 then
    return jsonb_build_object('suggestion', null);
  end if;

  select p.display_name, p.username,
    greatest(
      similarity(coalesce(p.display_name, ''), v_q),
      similarity(coalesce(p.username, ''), v_q)
    ) as sim
  into v_best_profile
  from profiles p
  where p.is_public = true
    and (similarity(coalesce(p.display_name, ''), v_q) > 0.25 or similarity(coalesce(p.username, ''), v_q) > 0.25)
  order by greatest(
    similarity(coalesce(p.display_name, ''), v_q),
    similarity(coalesce(p.username, ''), v_q)
  ) desc nulls last
  limit 1;

  if found and v_best_profile.sim is not null then
    v_sim_p := v_best_profile.sim;
  else
    v_sim_p := 0;
  end if;

  select a.title,
    similarity(coalesce(a.title, ''), v_q) as sim
  into v_best_artwork
  from artworks a
  where a.visibility = 'public'
    and similarity(coalesce(a.title, ''), v_q) > 0.25
  order by similarity(coalesce(a.title, ''), v_q) desc nulls last
  limit 1;

  if found and v_best_artwork.sim is not null then
    v_sim_a := v_best_artwork.sim;
  else
    v_sim_a := 0;
  end if;

  if v_sim_p >= v_sim_a and v_sim_p > 0.25 then
    return jsonb_build_object(
      'suggestion',
      coalesce(trim(v_best_profile.display_name::text), v_best_profile.username::text)
    );
  end if;
  if v_sim_a > 0.25 then
    return jsonb_build_object('suggestion', v_best_artwork.title);
  end if;
  return jsonb_build_object('suggestion', null);
end;
$$;

grant execute on function public.get_search_suggestion(text) to authenticated;
grant execute on function public.get_search_suggestion(text) to anon;
