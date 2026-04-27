-- Delegation Upgrade Phase 4 (in-app notifications) — type check extension.
--
-- Extends `notifications.notifications_type_check` to include four new
-- delegation lifecycle types. Pure CHECK constraint update — no row data
-- moves, no policies change. Safe to re-run.
--
--   delegation_invite_received  → delegate when delegator creates an invite
--   delegation_accepted         → delegator when delegate accepts
--   delegation_declined         → delegator when delegate declines
--   delegation_revoked          → delegate when delegator revokes an active
--                                 delegation (only fires if delegate has a
--                                 profile_id, i.e. accepted at some point)
--
-- The actual `insert into notifications(...)` calls live in lifecycle RPCs
-- and are added by `20260504000100_delegation_notification_inserts.sql`.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'like','follow','claim_request','claim_confirmed','claim_rejected',
    'price_inquiry','price_inquiry_reply','new_work','connection_message',
    'board_save','board_public',
    'delegation_invite_received','delegation_accepted',
    'delegation_declined','delegation_revoked'
  ]));

commit;
