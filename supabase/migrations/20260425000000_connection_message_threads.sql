-- Connection message threads: participant_key + conversation RPC.
--
-- The v1 of `connection_messages` was "inbox-only": `listMyReceivedMessages`
-- returned a flat, recipient-scoped feed. This patch upgrades the surface to
-- full conversation threads with both directions grouped together, which is
-- required now that `/my/messages` presents conversations and `/my/messages/[peer]`
-- renders an inline reply composer.
--
-- Changes:
--   1. Add a generated, stored `participant_key` column that canonicalizes
--      the (sender, recipient) pair into a deterministic string. This lets
--      PostgREST group both directions of a thread without a view.
--   2. Backfill the column implicitly via `generated always as ... stored`.
--   3. Add an index aligned with the conversation-list access pattern.
--   4. Add `list_connection_conversations` RPC which returns one row per
--      thread (newest first) with the last message preview and an unread
--      count scoped to `auth.uid()`.
--
-- RLS is unchanged: the existing select policy (recipient OR sender) already
-- authorises reading both directions of the caller's own threads.

-- ─── Column ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'connection_messages'
      and column_name = 'participant_key'
  ) then
    alter table public.connection_messages
      add column participant_key text
        generated always as (
          least(sender_id::text, recipient_id::text)
          || ':'
          || greatest(sender_id::text, recipient_id::text)
        ) stored;
  end if;
end $$;

-- ─── Index ───────────────────────────────────────────────────────────────
create index if not exists idx_connection_messages_participant_created
  on public.connection_messages (participant_key, created_at desc);

-- ─── RPC: list_connection_conversations ─────────────────────────────────
-- Returns one row per thread for the authenticated user, newest first.
--   • `other_user_id`   — the peer's profile id (= auth.users.id)
--   • `last_*`          — last message preview fields (ordered by created_at)
--   • `last_is_from_me` — true when the caller is the sender of the last msg
--   • `unread_count`    — messages received from the peer that are unread
--
-- Cursor is time-based: pass the oldest `last_created_at` from the current
-- page as `before_ts` to load the next page.
create or replace function public.list_connection_conversations(
  limit_count int default 20,
  before_ts timestamptz default null
)
returns table (
  participant_key text,
  other_user_id uuid,
  last_message_id uuid,
  last_body text,
  last_created_at timestamptz,
  last_read_at timestamptz,
  last_is_from_me boolean,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  ),
  mine as (
    select
      cm.id,
      cm.participant_key,
      cm.sender_id,
      cm.recipient_id,
      cm.body,
      cm.read_at,
      cm.created_at,
      row_number() over (
        partition by cm.participant_key
        order by cm.created_at desc
      ) as rn
    from public.connection_messages cm
    where cm.sender_id = (select uid from me)
       or cm.recipient_id = (select uid from me)
  ),
  latest as (
    select *
    from mine
    where rn = 1
  ),
  unread as (
    select
      participant_key,
      count(*)::bigint as unread_count
    from public.connection_messages
    where recipient_id = (select uid from me)
      and read_at is null
    group by participant_key
  )
  select
    l.participant_key,
    case
      when l.sender_id = (select uid from me) then l.recipient_id
      else l.sender_id
    end as other_user_id,
    l.id as last_message_id,
    l.body as last_body,
    l.created_at as last_created_at,
    l.read_at as last_read_at,
    (l.sender_id = (select uid from me)) as last_is_from_me,
    coalesce(u.unread_count, 0) as unread_count
  from latest l
  left join unread u on u.participant_key = l.participant_key
  where before_ts is null or l.created_at < before_ts
  order by l.created_at desc
  limit greatest(1, least(limit_count, 50));
$$;

grant execute on function public.list_connection_conversations(int, timestamptz)
  to authenticated;
