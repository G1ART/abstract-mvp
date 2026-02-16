-- P0: Auto-generate username on profiles insert when username is null (avoids NOT NULL 23502).
-- Run after p0_profile_ssot_single_rpc.sql so upsert_my_profile insert can succeed for new users.

create or replace function public.profiles_set_username_if_null()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.username is null or trim(NEW.username) = '' then
    NEW.username := 'user_' || substring(NEW.id::text from 1 for 8);
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_username_autogen on public.profiles;
create trigger profiles_username_autogen
  before insert on public.profiles
  for each row
  execute function public.profiles_set_username_if_null();
