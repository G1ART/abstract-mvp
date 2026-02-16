-- v5.4: Base profile update via RPC (auth.uid() 기반, 프론트 eq(id,uid) 제거)

create or replace function public.update_my_profile_base(p_patch jsonb, p_completeness int)
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
  set
    display_name = case when (p_patch ? 'display_name') then nullif(trim(p_patch->>'display_name'), '') else p.display_name end,
    bio = case when (p_patch ? 'bio') then nullif(trim(p_patch->>'bio'), '') else p.bio end,
    location = case when (p_patch ? 'location') then nullif(trim(p_patch->>'location'), '') else p.location end,
    website = case
      when (p_patch ? 'website') then nullif(trim(p_patch->>'website'), '')
      else p.website
    end,
    avatar_url = case when (p_patch ? 'avatar_url') then nullif(trim(p_patch->>'avatar_url'), '') else p.avatar_url end,
    is_public = case when (p_patch ? 'is_public') then coalesce((p_patch->>'is_public')::boolean, p.is_public) else p.is_public end,
    main_role = case when (p_patch ? 'main_role') then nullif(trim(p_patch->>'main_role'), '') else p.main_role end,
    roles = case when (p_patch ? 'roles') and jsonb_typeof(p_patch->'roles') = 'array' then
      (select array_agg(x) from jsonb_array_elements_text(p_patch->'roles') as x)
    else p.roles end,
    education = case when (p_patch ? 'education') then (p_patch->'education') else p.education end,
    profile_completeness = coalesce(p_completeness, p.profile_completeness),
    profile_updated_at = now()
  where p.id = auth.uid()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.update_my_profile_base(jsonb, int) to anon, authenticated;
