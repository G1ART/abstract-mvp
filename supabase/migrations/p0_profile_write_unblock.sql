-- P0: unblock writes for profiles + profile_details
-- 1) RLS policies (safe + minimal)
alter table if exists public.profiles enable row level security;
alter table if exists public.profile_details enable row level security;

-- PROFILES: allow authenticated user to select/update own row
do $$
begin
  -- select policy
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own'
  ) then
    create policy profiles_select_own on public.profiles
      for select to authenticated
      using (id = auth.uid());
  end if;

  -- update policy
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own'
  ) then
    create policy profiles_update_own on public.profiles
      for update to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;

  -- insert policy (for bootstrap/first save)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own'
  ) then
    create policy profiles_insert_own on public.profiles
      for insert to authenticated
      with check (id = auth.uid());
  end if;
end$$;

-- PROFILE_DETAILS: allow authenticated user to select/insert/update own row (user_id)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profile_details' and policyname='profile_details_select_own'
  ) then
    create policy profile_details_select_own on public.profile_details
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profile_details' and policyname='profile_details_upsert_own'
  ) then
    create policy profile_details_upsert_own on public.profile_details
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profile_details' and policyname='profile_details_update_own'
  ) then
    create policy profile_details_update_own on public.profile_details
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

-- 2) Ensure key RPC functions run reliably
-- If these functions exist, mark them SECURITY DEFINER so RLS doesn't silently block writes.
-- (Still uses auth.uid() for ownership check, so safe.)

-- update_my_profile_base
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_my_profile_base') then
    execute 'alter function public.update_my_profile_base(jsonb, int) security definer';
  end if;
exception when others then
  -- ignore if signature differs; we'll still rely on policies above
end$$;

-- update_my_profile_details (jsonb column path)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_my_profile_details') then
    execute 'alter function public.update_my_profile_details(jsonb, int) security definer';
  end if;
exception when others then
end$$;

-- upsert_profile_details (table path)
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='upsert_profile_details') then
    execute 'alter function public.upsert_profile_details(jsonb) security definer';
  end if;
exception when others then
end$$;

-- Grants (execute)
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.profile_details to authenticated;
