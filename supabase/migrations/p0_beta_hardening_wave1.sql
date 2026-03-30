-- Beta Hardening Wave 1: analytics events + price inquiry thread + inbox fields
-- Idempotent: safe to re-run in SQL Editor (uses IF NOT EXISTS / DROP IF EXISTS patterns).

-- ---------------------------------------------------------------------------
-- 1) First-party beta analytics (client insert-only; users read own rows)
-- ---------------------------------------------------------------------------
create table if not exists public.beta_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_beta_analytics_events_created
  on public.beta_analytics_events (created_at desc);
create index if not exists idx_beta_analytics_events_name_created
  on public.beta_analytics_events (event_name, created_at desc);
create index if not exists idx_beta_analytics_events_user_created
  on public.beta_analytics_events (user_id, created_at desc)
  where user_id is not null;

alter table public.beta_analytics_events enable row level security;

drop policy if exists beta_analytics_events_insert_own on public.beta_analytics_events;
create policy beta_analytics_events_insert_own on public.beta_analytics_events
  for insert to authenticated
  with check (
    user_id is null or user_id = auth.uid()
  );

drop policy if exists beta_analytics_events_select_own on public.beta_analytics_events;
create policy beta_analytics_events_select_own on public.beta_analytics_events
  for select to authenticated
  using (user_id = auth.uid());

grant insert, select on public.beta_analytics_events to authenticated;

comment on table public.beta_analytics_events is 'Lightweight first-party product events for beta diagnostics; no PII in payload by convention.';

-- ---------------------------------------------------------------------------
-- 2) Price inquiry: inbox status + unread flags + message thread
-- ---------------------------------------------------------------------------
alter table public.price_inquiries
  add column if not exists inquiry_status text not null default 'new',
  add column if not exists last_message_at timestamptz,
  add column if not exists artist_unread boolean not null default true,
  add column if not exists inquirer_unread boolean not null default false;

alter table public.price_inquiries drop constraint if exists price_inquiries_inquiry_status_check;
alter table public.price_inquiries add constraint price_inquiries_inquiry_status_check
  check (inquiry_status in ('new', 'open', 'replied', 'closed'));

comment on column public.price_inquiries.inquiry_status is 'new | open | replied | closed — inbox workflow.';
comment on column public.price_inquiries.last_message_at is 'Latest thread activity.';
comment on column public.price_inquiries.artist_unread is 'True when inquirer posted and artist-side has not marked read.';
comment on column public.price_inquiries.inquirer_unread is 'True when artist/delegate posted and inquirer has not marked read.';

update public.price_inquiries
set
  last_message_at = coalesce(replied_at, created_at),
  inquiry_status = case
    when coalesce(inquiry_status, '') = 'closed' then 'closed'
    when replied_at is not null then 'replied'
    else coalesce(nullif(inquiry_status, ''), 'open')
  end,
  artist_unread = case when replied_at is null then true else false end,
  inquirer_unread = case when replied_at is not null then true else false end
where last_message_at is null;

create table if not exists public.price_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.price_inquiries (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_price_inquiry_messages_inquiry_created
  on public.price_inquiry_messages (inquiry_id, created_at asc);

alter table public.price_inquiry_messages enable row level security;

drop policy if exists price_inquiry_messages_select on public.price_inquiry_messages;
create policy price_inquiry_messages_select on public.price_inquiry_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.price_inquiries pi
      where pi.id = price_inquiry_messages.inquiry_id
        and public.can_select_price_inquiry(pi.artwork_id, pi.inquirer_id)
    )
  );

drop policy if exists price_inquiry_messages_insert on public.price_inquiry_messages;
create policy price_inquiry_messages_insert on public.price_inquiry_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.price_inquiries pi
      where pi.id = price_inquiry_messages.inquiry_id
        and (
          pi.inquirer_id = auth.uid()
          or public.can_reply_to_price_inquiry(pi.artwork_id) = true
        )
    )
  );

grant select, insert on public.price_inquiry_messages to authenticated;

-- Backfill thread rows from legacy single message (one row per inquiry)
insert into public.price_inquiry_messages (inquiry_id, sender_id, body, created_at)
select pi.id, pi.inquirer_id, coalesce(nullif(trim(pi.message), ''), '(no message)'), pi.created_at
from public.price_inquiries pi
where not exists (
  select 1 from public.price_inquiry_messages m where m.inquiry_id = pi.id
)
  and pi.message is not null
  and length(trim(pi.message)) > 0;

insert into public.price_inquiry_messages (inquiry_id, sender_id, body, created_at)
select pi.id, coalesce(pi.replied_by_id, public.price_inquiry_artist_id(pi.artwork_id)), coalesce(pi.artist_reply, ''), pi.replied_at
from public.price_inquiries pi
where pi.replied_at is not null
  and coalesce(nullif(trim(pi.artist_reply), ''), '') <> ''
  and not exists (
    select 1
    from public.price_inquiry_messages m
    where m.inquiry_id = pi.id
      and m.sender_id <> pi.inquirer_id
      and m.created_at >= pi.replied_at - interval '1 second'
  );

create or replace function public.touch_price_inquiry_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquirer uuid;
  v_artwork uuid;
begin
  select pi.inquirer_id, pi.artwork_id
  into v_inquirer, v_artwork
  from public.price_inquiries pi
  where pi.id = new.inquiry_id;

  update public.price_inquiries pi
  set
    last_message_at = new.created_at,
    inquiry_status = case
      when pi.inquiry_status = 'closed' then pi.inquiry_status
      when new.sender_id = v_inquirer then
        case when pi.inquiry_status = 'new' then 'open' else pi.inquiry_status end
      else 'replied'
    end,
    artist_unread = (new.sender_id = v_inquirer),
    inquirer_unread = (new.sender_id <> v_inquirer),
    artist_reply = case
      when new.sender_id <> v_inquirer then substring(new.body from 1 for 8000)
      else pi.artist_reply
    end,
    replied_at = case
      when new.sender_id <> v_inquirer and pi.replied_at is null then new.created_at
      else pi.replied_at
    end,
    replied_by_id = case
      when new.sender_id <> v_inquirer and pi.replied_by_id is null then new.sender_id
      else pi.replied_by_id
    end
  where pi.id = new.inquiry_id;

  return new;
end;
$$;

drop trigger if exists trg_price_inquiry_messages_touch on public.price_inquiry_messages;
create trigger trg_price_inquiry_messages_touch
  after insert on public.price_inquiry_messages
  for each row execute function public.touch_price_inquiry_on_message();

-- Mark read (safe flags only; avoids broad UPDATE on inquiry rows from client)
create or replace function public.mark_price_inquiry_read(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.price_inquiries pi
  set
    inquirer_unread = case when pi.inquirer_id = auth.uid() then false else pi.inquirer_unread end,
    artist_unread = case
      when public.can_reply_to_price_inquiry(pi.artwork_id) = true and pi.inquirer_id <> auth.uid()
      then false
      else pi.artist_unread
    end
  where pi.id = p_inquiry_id
    and public.can_select_price_inquiry(pi.artwork_id, pi.inquirer_id);
end;
$$;

grant execute on function public.mark_price_inquiry_read(uuid) to authenticated;

comment on function public.mark_price_inquiry_read(uuid) is 'Inquirer clears inquirer_unread; artist/delegate clears artist_unread.';

-- Close inquiry (artist/delegate or inquirer)
create or replace function public.set_price_inquiry_status(p_inquiry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status is null or p_status not in ('new', 'open', 'replied', 'closed') then
    raise exception 'invalid status';
  end if;
  update public.price_inquiries pi
  set inquiry_status = p_status
  where pi.id = p_inquiry_id
    and public.can_select_price_inquiry(pi.artwork_id, pi.inquirer_id)
    and (
      pi.inquirer_id = auth.uid()
      or public.can_reply_to_price_inquiry(pi.artwork_id) = true
    );
end;
$$;

grant execute on function public.set_price_inquiry_status(uuid, text) to authenticated;
