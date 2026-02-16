-- Supabase Diagnostic SQL — Profile_details legacy impact check
-- Run in Supabase SQL Editor on the SAME project your app uses.
--
-- Result interpretation:
-- - A 확정: profile_details table exists and has data → need data backfill to profiles.profile_details
-- - B 확정: triggers/functions conflict with profile save RPC → remove or fix
-- - C 확정: env mismatch (different Supabase project) → unify Vercel/local env

-- 0) Confirm both structures exist
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('profiles','profile_details','Profile_details');

-- 1) Does profiles actually have profile_details jsonb and is it populated?
select
  count(*) as total_profiles,
  count(profile_details) as nonnull_profile_details,
  count(*) filter (where coalesce(profile_details,'{}'::jsonb) <> '{}'::jsonb) as nonempty_profile_details
from public.profiles;

-- 2) Is there legacy data sitting only in profile_details table?
-- NOTE: Fails with "relation does not exist" if profile_details table was never created (app uses profiles.profile_details jsonb only)
select
  count(*) as total_rows,
  count(user_id) as with_user_id
from public.profile_details;

-- 3) Are there triggers touching profiles or profile_details?
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema='public'
  and event_object_table in ('profiles','profile_details','Profile_details');

-- 4) Any functions/views referencing profile_details?
select
  routine_name,
  routine_definition
from information_schema.routines
where routine_schema='public'
  and routine_definition ilike '%profile_details%';
