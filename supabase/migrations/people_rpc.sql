-- People recommended + search RPCs with cursor pagination.
-- get_recommended_people: reason_tags + reason_detail (explainable recommendations).
create or replace function get_recommended_people(
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
  v_uid uuid := auth.uid();
  v_cursor_id uuid;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  if p_cursor is not null and length(trim(p_cursor)) > 0 then
    begin
      v_cursor_id := convert_from(decode(p_cursor, 'base64'), 'UTF8')::uuid;
    exception when others then
      v_cursor_id := null;
    end;
  else
    v_cursor_id := null;
  end if;

  return query
  with viewer_data as (
    select vd.city, vd.themes, vd.mediums, vd.education
    from (select 1) dummy
    left join profiles vd on vd.id = v_uid
  ),
  primary_rows as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio,
           p.main_role, p.roles, p.is_public,
           p.city as p_city, p.themes as p_themes, p.mediums as p_mediums, p.education as p_education,
           vd.city as v_city, vd.themes as v_themes, vd.mediums as v_mediums, vd.education as v_education,
           (array_length(v_roles, 1) is not null and array_length(v_roles, 1) > 0
            and ((p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))) as role_matched
    from profiles p
    cross join viewer_data vd
    where p.is_public = true
      and p.id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_uid is null or not exists (
        select 1 from follows f where f.follower_id = v_uid and f.following_id = p.id
      ))
      and (v_cursor_id is null or p.id < v_cursor_id)
    order by p.id desc
    limit v_limit
  ),
  primary_with_reasons as (
    select pr.*,
      array_remove(array[
        case when pr.role_matched then 'role_match' end,
        case when pr.v_city is not null and pr.p_city is not null
             and lower(trim(pr.p_city)) = lower(trim(pr.v_city)) then 'same_city' end,
        case when (select count(*) from unnest(coalesce(pr.p_themes,'{}')::text[]) t
                   where t = any(coalesce(pr.v_themes,'{}')::text[])) >= 2 then 'shared_themes' end,
        case when (select count(*) from unnest(coalesce(pr.p_mediums,'{}')::text[]) m
                   where m = any(coalesce(pr.v_mediums,'{}')::text[])) >= 1 then 'shared_medium' end,
        case when exists (
          select 1 from jsonb_array_elements(coalesce(pr.v_education,'[]'::jsonb)) ve,
                       jsonb_array_elements(coalesce(pr.p_education,'[]'::jsonb)) pe
          where trim(lower(coalesce(ve->>'school',''))) = trim(lower(coalesce(pe->>'school','')))
            and trim(coalesce(ve->>'school','')) != ''
        ) then 'shared_school' end
      ], null) as reason_tags,
      (select jsonb_agg(to_jsonb(t)) from unnest(coalesce(pr.p_themes,'{}')::text[]) t
       where t = any(coalesce(pr.v_themes,'{}')::text[])) as shared_themes_arr
    from primary_rows pr
  ),
  primary_result as (
    select jsonb_build_object(
      'id', pw.id, 'username', pw.username, 'display_name', pw.display_name,
      'avatar_url', pw.avatar_url, 'bio', pw.bio, 'main_role', pw.main_role,
      'roles', pw.roles, 'is_public', pw.is_public,
      'reason', 'role_match',
      'reason_tags', coalesce(pw.reason_tags, '{}'),
      'reason_detail', jsonb_build_object(
        'sharedThemesTop', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select x from jsonb_array_elements_text(coalesce(pw.shared_themes_arr,'[]'::jsonb)) x limit 2) sub),
        'sharedSchool', (select trim(ve->>'school') from jsonb_array_elements(coalesce(pw.v_education,'[]'::jsonb)) ve
                        where exists (select 1 from jsonb_array_elements(coalesce(pw.p_education,'[]'::jsonb)) pe
                                      where trim(lower(coalesce(ve->>'school',''))) = trim(lower(coalesce(pe->>'school',''))))
                        limit 1)
      )
    )
    from primary_with_reasons pw
  ),
  fallback_rows as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio,
           p.main_role, p.roles, p.is_public,
           p.city as p_city, p.themes as p_themes, p.mediums as p_mediums, p.education as p_education,
           vd.city as v_city, vd.themes as v_themes, vd.mediums as v_mediums, vd.education as v_education,
           (array_length(v_roles, 1) is not null and array_length(v_roles, 1) > 0
            and ((p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))) as role_matched
    from profiles p
    cross join viewer_data vd
    where p.is_public = true
      and p.id != coalesce(v_uid, '00000000-0000-0000-0000-000000000000'::uuid)
      and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
           or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
      and (v_cursor_id is null or p.id < v_cursor_id)
      and not exists (select 1 from primary_result limit 1)
    order by p.id desc
    limit v_limit
  ),
  fallback_with_reasons as (
    select fr.*,
      array_remove(array[
        case when fr.role_matched then 'role_match' end,
        case when fr.v_city is not null and fr.p_city is not null
             and lower(trim(fr.p_city)) = lower(trim(fr.v_city)) then 'same_city' end,
        case when (select count(*) from unnest(coalesce(fr.p_themes,'{}')::text[]) t
                   where t = any(coalesce(fr.v_themes,'{}')::text[])) >= 2 then 'shared_themes' end,
        case when (select count(*) from unnest(coalesce(fr.p_mediums,'{}')::text[]) m
                   where m = any(coalesce(fr.v_mediums,'{}')::text[])) >= 1 then 'shared_medium' end,
        case when exists (
          select 1 from jsonb_array_elements(coalesce(fr.v_education,'[]'::jsonb)) ve,
                       jsonb_array_elements(coalesce(fr.p_education,'[]'::jsonb)) pe
          where trim(lower(coalesce(ve->>'school',''))) = trim(lower(coalesce(pe->>'school','')))
            and trim(coalesce(ve->>'school','')) != ''
        ) then 'shared_school' end
      ], null) as reason_tags,
      (select jsonb_agg(to_jsonb(t)) from unnest(coalesce(fr.p_themes,'{}')::text[]) t
       where t = any(coalesce(fr.v_themes,'{}')::text[])) as shared_themes_arr
    from fallback_rows fr
  ),
  fallback_result as (
    select jsonb_build_object(
      'id', fw.id, 'username', fw.username, 'display_name', fw.display_name,
      'avatar_url', fw.avatar_url, 'bio', fw.bio, 'main_role', fw.main_role,
      'roles', fw.roles, 'is_public', fw.is_public,
      'reason', 'fallback',
      'reason_tags', coalesce(fw.reason_tags, '{}'),
      'reason_detail', jsonb_build_object(
        'sharedThemesTop', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select x from jsonb_array_elements_text(coalesce(fw.shared_themes_arr,'[]'::jsonb)) x limit 2) sub),
        'sharedSchool', (select trim(ve->>'school') from jsonb_array_elements(coalesce(fw.v_education,'[]'::jsonb)) ve
                        where exists (select 1 from jsonb_array_elements(coalesce(fw.p_education,'[]'::jsonb)) pe
                                      where trim(lower(coalesce(ve->>'school',''))) = trim(lower(coalesce(pe->>'school',''))))
                        limit 1)
      )
    )
    from fallback_with_reasons fw
  )
  select * from primary_result
  union all
  select * from fallback_result;
end;
$$;

-- Search: q for username/display_name ilike, role filter, keyset pagination.
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
  v_pattern text;
  v_cursor_id uuid;
  v_roles text[] := coalesce(p_roles, '{}');
  v_limit int;
begin
  if trim(coalesce(p_q, '')) = '' then
    return;
  end if;
  v_pattern := '%' || lower(trim(p_q)) || '%';
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

  return query
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar_url', p.avatar_url, 'bio', p.bio, 'main_role', p.main_role,
    'roles', p.roles, 'is_public', p.is_public, 'reason', 'search'
  )
  from profiles p
  where p.is_public = true
    and (p.username ilike v_pattern or p.display_name ilike v_pattern)
    and (array_length(v_roles, 1) is null or array_length(v_roles, 1) = 0
         or (p.main_role::text = any(v_roles)) or (coalesce(p.roles, '{}'::text[]) && v_roles))
    and (v_cursor_id is null or p.id < v_cursor_id)
  order by p.id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_recommended_people(text[], int, text) to authenticated;
grant execute on function public.get_recommended_people(text[], int, text) to anon;
grant execute on function public.search_people(text, text[], int, text) to authenticated;
grant execute on function public.search_people(text, text[], int, text) to anon;
