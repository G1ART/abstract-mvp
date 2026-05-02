-- Profile Materials P6.1: dedicated RPC for CV upserts.
--
-- The CV editor at /my/profile/cv writes to four jsonb columns at once:
--   profiles.education / profiles.exhibitions / profiles.awards /
--   profiles.residencies.
--
-- Going through the existing big `upsert_my_profile_*` RPC is overkill
-- for this surface (it touches base + details + persona modules), and
-- routing through /settings would lose the dedicated editor's UX. This
-- function takes only the four CV columns, keeps any column the caller
-- omitted untouched, and is RLS-safe via auth.uid().

create or replace function public.update_my_profile_cv(
  p_education   jsonb default null,
  p_exhibitions jsonb default null,
  p_awards      jsonb default null,
  p_residencies jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'unauthorized: auth.uid() is null'
      using errcode = '28000';
  end if;

  -- Each column updates only when the caller passed a non-null value, so
  -- partial writes (e.g. saving only education) leave the other three
  -- arrays untouched. Empty array `'[]'::jsonb` is still a valid clear.
  update public.profiles
  set
    education    = case when p_education   is not null then p_education   else education   end,
    exhibitions  = case when p_exhibitions is not null then p_exhibitions else exhibitions end,
    awards       = case when p_awards      is not null then p_awards      else awards      end,
    residencies  = case when p_residencies is not null then p_residencies else residencies end,
    profile_updated_at = now()
  where id = uid;
end;
$$;

revoke all on function public.update_my_profile_cv(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.update_my_profile_cv(jsonb, jsonb, jsonb, jsonb) to authenticated;
