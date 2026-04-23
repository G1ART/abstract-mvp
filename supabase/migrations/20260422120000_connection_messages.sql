-- Connection Messages: lightweight 1:1 direct messages tied to the
-- "Draft an intro" AI flow on /people. Unlike price_inquiries, these are
-- not scoped to a specific artwork — they are the social equivalent of a
-- LinkedIn connection note.
--
-- Separate table (instead of reusing price_inquiries) because:
--   1) price_inquiries.artwork_id is NOT NULL and carries pipeline_stage
--      semantics irrelevant to social introductions.
--   2) RLS policies for price_inquiries authorise the artist (and their
--      delegates) via artwork ownership — that would not work for
--      recipient-only DMs that are not about any specific work.

-- ─── Table ────────────────────────────────────────────────────────────────
create table if not exists public.connection_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint connection_messages_no_self check (sender_id <> recipient_id)
);

create index if not exists idx_connection_messages_recipient_created
  on public.connection_messages (recipient_id, created_at desc);
create index if not exists idx_connection_messages_sender_created
  on public.connection_messages (sender_id, created_at desc);
create index if not exists idx_connection_messages_recipient_unread
  on public.connection_messages (recipient_id)
  where read_at is null;

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.connection_messages enable row level security;

drop policy if exists connection_messages_select_own on public.connection_messages;
create policy connection_messages_select_own on public.connection_messages
  for select to authenticated
  using (recipient_id = auth.uid() or sender_id = auth.uid());

drop policy if exists connection_messages_insert_sender on public.connection_messages;
create policy connection_messages_insert_sender on public.connection_messages
  for insert to authenticated
  with check (sender_id = auth.uid());

-- Only recipient may flip read_at (sender must not edit delivered content).
drop policy if exists connection_messages_update_recipient on public.connection_messages;
create policy connection_messages_update_recipient on public.connection_messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

grant select, insert, update on public.connection_messages to authenticated;

-- ─── Notifications integration ───────────────────────────────────────────
-- Re-issue the notifications type check constraint with the full current set
-- so PostgREST never rejects a valid insert. `p0_wave2_differentiation.sql`
-- dropped the previous constraint without reinstating it; this statement
-- cleans that up and adds `connection_message` + `new_work`.
do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_check;
exception when others then null;
end $$;

alter table public.notifications add constraint notifications_type_check check (
  type in (
    'like',
    'follow',
    'claim_request',
    'claim_confirmed',
    'claim_rejected',
    'price_inquiry',
    'price_inquiry_reply',
    'new_work',
    'connection_message'
  )
);

-- Trigger: fan out to the recipient's notifications feed on insert.
create or replace function public.notify_on_connection_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  if new.sender_id = new.recipient_id then
    return new;
  end if;
  v_preview := left(new.body, 140);
  insert into public.notifications (user_id, type, actor_id, payload)
  values (
    new.recipient_id,
    'connection_message',
    new.sender_id,
    jsonb_build_object('message_id', new.id, 'preview', v_preview)
  );
  return new;
end;
$$;

drop trigger if exists on_connection_message_notify on public.connection_messages;
create trigger on_connection_message_notify
  after insert on public.connection_messages
  for each row execute function public.notify_on_connection_message();
