-- Claim period (past/current/future) + price inquiry to all delegates, first reply wins.
-- Design: docs/PRICE_INQUIRY_AND_CLAIM_PERIOD_DESIGN.md

-- 1) claims: period_status, start_date, end_date
alter table public.claims
  add column if not exists period_status text,
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.claims drop constraint if exists claims_period_status_check;
alter table public.claims add constraint claims_period_status_check
  check (period_status is null or period_status in ('past', 'current', 'future'));

comment on column public.claims.period_status is 'past = ended, current = ongoing, future = scheduled. Used for INVENTORY/CURATED/EXHIBITED.';
comment on column public.claims.end_date is 'Optional; used for extension (e.g. +6mo/+1y) and auto-expiry.';

-- Backfill: confirmed delegate claims get period_status = 'current'
update public.claims
set period_status = 'current'
where claim_type in ('INVENTORY', 'CURATED', 'EXHIBITED')
  and status = 'confirmed'
  and period_status is null;

-- 2) price_inquiries: who replied (artist or delegate)
alter table public.price_inquiries
  add column if not exists replied_by_id uuid references public.profiles(id) on delete set null;

comment on column public.price_inquiries.replied_by_id is 'Profile who submitted the reply (artist or current delegate).';

-- 3) Current delegate ids for an artwork (confirmed, period_status = 'current')
create or replace function public.get_current_delegate_ids(p_artwork_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct c.subject_profile_id
  from public.claims c
  where c.work_id = p_artwork_id
    and c.claim_type in ('INVENTORY', 'CURATED', 'EXHIBITED')
    and c.status = 'confirmed'
    and (c.period_status = 'current' or (c.period_status is null and c.claim_type in ('INVENTORY', 'CURATED', 'EXHIBITED')));
$$;

-- 4) Recipients for price inquiry notification: artist + current delegates, exclude inquirer
create or replace function public.get_price_inquiry_recipient_ids(p_artwork_id uuid, p_inquirer_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct uid from (
    select public.price_inquiry_artist_id(p_artwork_id) as uid
    union
    select * from public.get_current_delegate_ids(p_artwork_id)
  ) t
  where uid is not null and uid <> p_inquirer_id;
$$;

-- 5) Can this user reply to price inquiries for this artwork? (artist or current delegate)
create or replace function public.can_reply_to_price_inquiry(p_artwork_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    public.price_inquiry_artist_id(p_artwork_id) = auth.uid()
    or exists (
      select 1 from public.get_current_delegate_ids(p_artwork_id) g
      where g = auth.uid()
    )
  );
$$;

-- 6) Can this user see (select) this price inquiry row?
create or replace function public.can_select_price_inquiry(p_artwork_id uuid, p_inquirer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    p_inquirer_id = auth.uid()
    or public.price_inquiry_artist_id(p_artwork_id) = auth.uid()
    or exists (select 1 from public.get_current_delegate_ids(p_artwork_id) g where g = auth.uid())
  );
$$;

-- 7) RLS: replace price_inquiries select/update with new logic
drop policy if exists price_inquiries_select_own on public.price_inquiries;
drop policy if exists price_inquiries_select_artist on public.price_inquiries;
drop policy if exists price_inquiries_update_artist on public.price_inquiries;

create policy price_inquiries_select_own on public.price_inquiries
  for select to authenticated
  using (inquirer_id = auth.uid());

create policy price_inquiries_select_artist_or_delegate on public.price_inquiries
  for select to authenticated
  using (public.can_select_price_inquiry(artwork_id, inquirer_id));

-- Update: only if not yet replied, and user is artist or current delegate
create policy price_inquiries_update_reply on public.price_inquiries
  for update to authenticated
  using (
    replied_at is null
    and public.can_reply_to_price_inquiry(artwork_id) = true
  )
  with check (
    replied_at is null
    and public.can_reply_to_price_inquiry(artwork_id) = true
  );

-- 8) Notify ALL recipients when inquiry is created (artist + current delegates)
create or replace function public.notify_on_price_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select * from public.get_price_inquiry_recipient_ids(new.artwork_id, new.inquirer_id)
  loop
    insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
    values (v_recipient, 'price_inquiry', new.inquirer_id, new.artwork_id, jsonb_build_object('inquiry_id', new.id));
  end loop;
  return new;
end;
$$;

-- 9) Notify inquirer + artist + other delegates when someone replies (first reply wins)
create or replace function public.notify_on_price_inquiry_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_replier uuid := new.replied_by_id;
begin
  if new.artist_reply is null or old.artist_reply is not null then
    return new;
  end if;

  -- Inquirer
  insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
  values (new.inquirer_id, 'price_inquiry_reply', coalesce(v_replier, public.price_inquiry_artist_id(new.artwork_id)), new.artwork_id, jsonb_build_object('inquiry_id', new.id));

  -- Artist + delegates except replier
  for v_recipient in
    select * from public.get_price_inquiry_recipient_ids(new.artwork_id, new.inquirer_id)
  loop
    if v_recipient is distinct from v_replier then
      insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
      values (v_recipient, 'price_inquiry_reply', coalesce(v_replier, public.price_inquiry_artist_id(new.artwork_id)), new.artwork_id, jsonb_build_object('inquiry_id', new.id));
    end if;
  end loop;
  return new;
end;
$$;
