-- P0: Harden ensure_my_profile so profile row always has username (prevents 23502 on bootstrap).
-- Delegates to ensure_profile_row for username-safe insert; returns profile row for UI.

create or replace function public.ensure_my_profile()
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth.uid() is null'; end if;
  perform public.ensure_profile_row();
  return query
  select p.id, p.username, p.profile_completeness, p.profile_details
  from public.profiles p
  where p.id = v_uid;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.upsert_my_profile(jsonb, jsonb, int) to authenticated;
grant execute on function public.update_my_profile_base(jsonb, int) to authenticated;
grant execute on function public.update_my_profile_details(jsonb, int) to authenticated;
