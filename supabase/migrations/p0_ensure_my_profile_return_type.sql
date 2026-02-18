-- Fix 42804 (datatype mismatch): ensure return type matches even if profiles.profile_completeness is smallint.
-- Also keep null-uid guard (return empty) to avoid 400 on bootstrap race.

create or replace function public.ensure_my_profile()
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  perform public.ensure_profile_row();
  return query
  select p.id, p.username, (p.profile_completeness::int), p.profile_details
  from public.profiles p
  where p.id = v_uid;
end;
$$;
