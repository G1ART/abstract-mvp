-- v5.1: Store profile details as jsonb on profiles, merge semantics via RPC
-- Run in Supabase SQL Editor

-- Add column if not exists
alter table public.profiles add column if not exists profile_details jsonb not null default '{}'::jsonb;

-- RPC: merge details into profiles.profile_details (no reset)
create or replace function public.update_my_profile_details(p_details jsonb, p_completeness int)
returns table(id uuid, username text, profile_completeness int, profile_details jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
  set profile_details = jsonb_strip_nulls(coalesce(p.profile_details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb)),
      profile_completeness = coalesce(p_completeness, p.profile_completeness),
      profile_updated_at = now()
  where p.id = auth.uid()
  returning p.id, p.username, p.profile_completeness, p.profile_details;
end;
$$;

grant execute on function public.update_my_profile_details(jsonb, int) to anon, authenticated;
