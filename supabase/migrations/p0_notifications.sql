-- Notifications: like, follow, claim_request, claim_confirmed, claim_rejected.
-- Option A: badge on avatar + list in dropdown / page.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like', 'follow', 'claim_request', 'claim_confirmed', 'claim_rejected')),
  actor_id uuid references public.profiles(id) on delete set null,
  artwork_id uuid references public.artworks(id) on delete set null,
  claim_id uuid references public.claims(id) on delete set null,
  payload jsonb default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- If table already existed without these columns (e.g. from partial run), add them
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists artwork_id uuid references public.artworks(id) on delete set null;
alter table public.notifications add column if not exists payload jsonb default '{}';

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_user_read on public.notifications(user_id, read_at);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only service (triggers) insert; no direct insert from client for MVP (we use triggers).
-- Grant so trigger can insert (trigger runs as table owner).
grant select, update on public.notifications to authenticated;
grant insert on public.notifications to authenticated;

-- Trigger: like -> notify artwork artist (unless self-like)
create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
begin
  select artist_id into v_artist_id from public.artworks where id = new.artwork_id;
  if v_artist_id is null or v_artist_id = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id)
  values (v_artist_id, 'like', new.user_id, new.artwork_id);
  return new;
end;
$$;

drop trigger if exists on_artwork_like_notify on public.artwork_likes;
create trigger on_artwork_like_notify
  after insert on public.artwork_likes
  for each row execute function public.notify_on_like();

-- Trigger: follow -> notify followed user (unless self-follow)
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id = new.following_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id);
  return new;
end;
$$;

drop trigger if exists on_follow_notify on public.follows;
create trigger on_follow_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- Trigger: claim pending -> notify artist (unless self-claim)
create or replace function public.notify_on_claim_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
begin
  if new.status is distinct from 'pending' or new.work_id is null then
    return new;
  end if;
  select artist_id into v_artist_id from public.artworks where id = new.work_id;
  if v_artist_id is null or v_artist_id = new.subject_profile_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id, claim_id, payload)
  values (v_artist_id, 'claim_request', new.subject_profile_id, new.work_id, new.id, jsonb_build_object('claim_type', new.claim_type));
  return new;
end;
$$;

drop trigger if exists on_claim_request_notify on public.claims;
create trigger on_claim_request_notify
  after insert on public.claims
  for each row execute function public.notify_on_claim_request();

-- Trigger: claim confirmed -> notify subject (requester)
create or replace function public.notify_on_claim_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
begin
  if new.status is distinct from 'confirmed' or old.status = 'confirmed' then
    return new;
  end if;
  select artist_id into v_artist_id from public.artworks where id = new.work_id;
  if v_artist_id is null or new.subject_profile_id = v_artist_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id, claim_id, payload)
  values (new.subject_profile_id, 'claim_confirmed', v_artist_id, new.work_id, new.id, jsonb_build_object('claim_type', new.claim_type));
  return new;
end;
$$;

drop trigger if exists on_claim_confirmed_notify on public.claims;
create trigger on_claim_confirmed_notify
  after update on public.claims
  for each row execute function public.notify_on_claim_confirmed();

-- Trigger: claim rejected (delete) -> notify subject
create or replace function public.notify_on_claim_rejected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
begin
  if old.status is distinct from 'pending' then
    return old;
  end if;
  select artist_id into v_artist_id from public.artworks where id = old.work_id;
  if v_artist_id is null then
    return old;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
  values (old.subject_profile_id, 'claim_rejected', v_artist_id, old.work_id, jsonb_build_object('claim_type', old.claim_type));
  return old;
end;
$$;

drop trigger if exists on_claim_rejected_notify on public.claims;
create trigger on_claim_rejected_notify
  after delete on public.claims
  for each row execute function public.notify_on_claim_rejected();
