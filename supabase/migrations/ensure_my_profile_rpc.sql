-- v5.6: Ensure profile row exists on app boot (prevents save failure / completeness 0)
-- Run in Supabase SQL Editor

create or replace function public.ensure_my_profile()
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth.uid() is null'; end if;
  return query
  insert into public.profiles as p (id, is_public, roles, profile_completeness, profile_details, profile_updated_at, updated_at)
  values (v_uid, true, '{}'::text[], 0, '{}'::jsonb, now(), now())
  on conflict (id) do update
  set updated_at = now()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.ensure_my_profile() to anon, authenticated;
