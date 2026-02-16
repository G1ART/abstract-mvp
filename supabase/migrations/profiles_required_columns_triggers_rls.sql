-- 1) Required columns (save 로직이 참조하는 컬럼이 없으면 update가 무조건 실패함)

alter table public.profiles
  add column if not exists profile_updated_at timestamptz;

alter table public.profiles
  add column if not exists profile_completeness int not null default 0;

alter table public.profiles
  add column if not exists education jsonb;

-- details jsonb (이미 v5.1에서 추가했으면 그대로 통과)
alter table public.profiles
  add column if not exists profile_details jsonb not null default '{}'::jsonb;

-- 2) updated_at / profile_updated_at 자동 갱신 트리거 보장
-- (updated_at 컬럼이 없다면 추가)
alter table public.profiles
  add column if not exists updated_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- profile_updated_at도 함께 갱신 (별도 트리거)
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.profile_updated_at = now();
  return new;
end;
$function$;

drop trigger if exists trg_profiles_profile_updated_at on public.profiles;
create trigger trg_profiles_profile_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

-- 3) RLS + 정책 재확인 (업데이트가 막히면 100% 실패)
alter table public.profiles enable row level security;

-- 최소 정책(없으면 생성)
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to public
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to public
with check (auth.uid() = id);

drop policy if exists profiles_select_public_or_self on public.profiles;
create policy profiles_select_public_or_self
on public.profiles
for select
to public
using (is_public = true or auth.uid() = id);

-- 4) GRANT (드물지만 컬럼 권한/테이블 권한이 꼬이면 update 자체가 막힘)
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to anon, authenticated;

-- 5) RPC: details merge (이미 있으니 replace로 재정의)
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
