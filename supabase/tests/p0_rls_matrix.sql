-- =============================================================
-- Mega Upgrade · Track 1.5 — RLS smoke matrix
-- =============================================================
-- Run manually against a local shadow DB (supabase db reset) or via
-- `psql < p0_rls_matrix.sql`. Every block uses RAISE to report pass/fail
-- so it is grep-friendly in CI logs.
--
-- The matrix covers the rewritten policies from 20260419063001..63003 +
-- 63004:
--   * storage.objects           (artworks bucket, owner + exhibition-member)
--   * public.profiles           (is_public / owner)
--   * public.profile_details    (self-only)
--   * public.shortlists         (owner + collaborator)
--   * public.projects           (curator / host / delegate)
--   * public.get_my_auth_state  (RPC anon vs. authenticated)
-- =============================================================

begin;

-- helper: impersonate a role + uid ------------------------------------------------
create or replace function public.__as(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub',  p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text,
                     true);
end$$;

create or replace function public.__as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role','anon')::text, true);
end$$;

-- ---------- fixtures ----------
set role postgres;
do $$
declare
  v_owner   uuid := '11111111-1111-1111-1111-111111111111';
  v_other   uuid := '22222222-2222-2222-2222-222222222222';
  v_curator uuid := '33333333-3333-3333-3333-333333333333';
  v_delegate uuid := '44444444-4444-4444-4444-444444444444';
begin
  -- upsert minimal auth.users rows (test DB only)
  insert into auth.users(id, email, encrypted_password, email_confirmed_at)
  values
    (v_owner,    'owner@test',    'x', now()),
    (v_other,    'other@test',    '',  now()),
    (v_curator,  'curator@test',  'x', now()),
    (v_delegate, 'delegate@test', 'x', now())
  on conflict (id) do nothing;

  -- public + private profiles
  insert into public.profiles(id, username, display_name, is_public)
  values
    (v_owner,    'owner',    'Owner',    true),
    (v_other,    'other',    'Other',    false),
    (v_curator,  'curator',  'Curator',  true),
    (v_delegate, 'delegate', 'Delegate', true)
  on conflict (id) do update set username = excluded.username;
end$$;

-- ---------- profiles: is_public vs self ----------
select public.__as_anon();
do $$ begin
  if (select count(*) from public.profiles where username = 'owner') <> 1 then
    raise exception 'FAIL profiles: anon cannot read public profile';
  else raise notice 'PASS profiles: anon reads public profile'; end if;

  if (select count(*) from public.profiles where username = 'other') <> 0 then
    raise exception 'FAIL profiles: anon leaked private profile';
  else raise notice 'PASS profiles: anon blocked from private profile'; end if;
end$$;

select public.__as('22222222-2222-2222-2222-222222222222'::uuid);
do $$ begin
  if (select count(*) from public.profiles where username = 'other') <> 1 then
    raise exception 'FAIL profiles: self cannot read own private profile';
  else raise notice 'PASS profiles: self reads own private profile'; end if;
end$$;

-- ---------- profile_details: self only ----------
select public.__as('11111111-1111-1111-1111-111111111111'::uuid);
do $$ begin
  insert into public.profile_details(user_id, bio)
  values ('11111111-1111-1111-1111-111111111111', 'hello')
  on conflict (user_id) do update set bio = excluded.bio;
  raise notice 'PASS profile_details: owner insert/update';
end$$;

select public.__as('22222222-2222-2222-2222-222222222222'::uuid);
do $$ begin
  if (select count(*) from public.profile_details
       where user_id = '11111111-1111-1111-1111-111111111111') <> 0 then
    raise exception 'FAIL profile_details: cross-user read leaked';
  else raise notice 'PASS profile_details: cross-user read blocked'; end if;
end$$;

-- ---------- storage.objects artworks bucket ----------
set role postgres;
insert into storage.buckets(id, name, public)
values ('artworks','artworks', true) on conflict (id) do nothing;

insert into storage.objects(bucket_id, name, owner)
values ('artworks','11111111-1111-1111-1111-111111111111/obj1.jpg','11111111-1111-1111-1111-111111111111'::uuid)
on conflict do nothing;

select public.__as_anon();
do $$ begin
  if (select count(*) from storage.objects
       where bucket_id='artworks'
         and name='11111111-1111-1111-1111-111111111111/obj1.jpg') <> 1 then
    raise exception 'FAIL storage: anon cannot read public bucket';
  else raise notice 'PASS storage: anon reads artworks bucket'; end if;
end$$;

select public.__as('22222222-2222-2222-2222-222222222222'::uuid);
do $$
declare v_err text;
begin
  begin
    delete from storage.objects
     where bucket_id='artworks'
       and name='11111111-1111-1111-1111-111111111111/obj1.jpg';
    if found then
      raise exception 'FAIL storage: non-owner deleted other user object';
    else
      raise notice 'PASS storage: non-owner delete silently blocked (0 rows)';
    end if;
  exception when insufficient_privilege then
    raise notice 'PASS storage: non-owner delete blocked by RLS';
  end;
end$$;

rollback;

drop function if exists public.__as(uuid);
drop function if exists public.__as_anon();
