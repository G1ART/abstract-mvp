-- Diagnostic: profiles UPDATE troubleshooting.
-- Run these in Supabase SQL Editor to check RLS, policies, column types.

-- 1) Column types
select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('main_role', 'roles', 'id', 'display_name', 'bio');

-- 2) RLS enabled
select relname, relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

-- 3) Policies
select polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.profiles'::regclass;
