-- Delegation Lifecycle Actions — QA Beta Hardening · PR-B
--
-- Background:
--   QA #4, #7, #11 reported gaps in the delegation lifecycle:
--     • #4  보낸 사람이 (수락 전) 위임 초대를 취소할 수 없음
--     • #7  보낸 사람이 active 상태에서 권한만 변경할 수 없음
--           (현재는 위임 통째로 해지 + 새 invite 보내기 → 3-step)
--     • #11 받은 사람이 active 상태에서 본인 의지로 위임을 끝낼 수 없음
--           (decline_delegation_by_id 는 pending 만 처리)
--
--   Plus a UX request: 받은 사람이 active 상태에서 보낸 사람에게
--   권한 조정을 *요청* 할 수 있도록. 별도 상태 추적 없이 가벼운
--   알림 + 메모 형태로 구현.
--
-- Design choices:
--   • Status enum is NOT extended (cannot ALTER TYPE inside a transaction
--     block, and adding 'canceled' / 'resigned' would force a wave of
--     downstream view/RPC updates). Instead reuse 'revoked' and
--     'declined' for terminal states, and DIFFERENTIATE in the audit
--     log (`event_type`) and notification stream (`type`):
--
--       Action                          | status set | event_type                  | notification type
--       --------------------------------|------------|-----------------------------|-----------------------------------
--       cancel_delegation_invite (NEW)  | revoked    | invite_canceled             | delegation_invite_canceled
--       update_delegation_permissions   | active     | permissions_updated         | delegation_permissions_updated
--       resign_delegation_by_delegate   | declined   | delegate_resigned           | delegation_resigned
--       request_permission_change       | (no chg)   | permission_change_requested | delegation_permission_change_requested
--
--   • All RPCs are SECURITY DEFINER and tightly check
--       auth.uid() = delegator (sender-side actions)
--       auth.uid() = delegate  (recipient-side actions)
--     so RLS is bypassed only for the validated subject.
--   • update_delegation_permissions sanitizes the new permission set
--     against a known whitelist; unknown tokens are dropped silently
--     (rather than rejected) to keep the UX forgiving.
--
-- Safe to re-run.
--
-- NOTE on dollar-quoting: each function uses a UNIQUE named tag
-- (`$cancel$`, `$update$`, `$resign$`, `$request$`) instead of the
-- bare `$$`. Supabase Dashboard's SQL Editor occasionally mis-splits
-- statements when several `$$ … $$` blocks land inside a single
-- transaction, so naming the tag eliminates ambiguity. We also DON'T
-- wrap in BEGIN/COMMIT — every statement here is independently
-- idempotent (`drop constraint if exists`, `create or replace`),
-- which lets the Editor execute statement-by-statement without
-- needing to pre-parse the whole body as one transaction.

---------------------------------------------------------------------------
-- 1. notifications.type CHECK — extend with the four new lifecycle types.
--    Restate the FULL list (existing pattern in the codebase: each
--    migration drops & recreates the constraint to include its delta).
---------------------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'like','follow','claim_request','claim_confirmed','claim_rejected',
    'price_inquiry','price_inquiry_reply','new_work','connection_message',
    'board_save','board_public',
    'delegation_invite_received','delegation_accepted',
    'delegation_declined','delegation_revoked',
    -- PR1 (private account v2 — 20260511000000):
    'follow_request','follow_request_accepted',
    -- PR-B (this migration):
    'delegation_invite_canceled',
    'delegation_resigned',
    'delegation_permissions_updated',
    'delegation_permission_change_requested'
  ]));

---------------------------------------------------------------------------
-- 2. cancel_delegation_invite — sender-side cancel of a PENDING invite.
--
--   We could reuse `revoke_delegation` (it already handles
--   `status in ('pending','active')`), but the recipient-facing copy
--   should differ ("초대 취소" vs "위임 해지"), so we route through a
--   distinct RPC + notification type. The status column is set to
--   'revoked' (no enum extension), and the audit event_type
--   `invite_canceled` lets surfaces decide whether to render
--   "cancellation" or "revocation" wording.
---------------------------------------------------------------------------

create or replace function public.cancel_delegation_invite(
  p_delegation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cancel$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_d   record;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status      = 'revoked',
         revoked_at  = v_now,
         revoked_by  = v_uid,
         updated_at  = v_now
   where id = p_delegation_id
     and delegator_profile_id = v_uid
     and status = 'pending'
  returning id, delegate_profile_id, delegate_email, scope_type,
            project_id, preset
       into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_pending');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'invite_canceled', 'profile', v_uid,
    'Pending invite canceled by sender',
    '{}'::jsonb
  );

  -- Notify delegate only when the invite had already been linked to a
  -- profile (i.e. the recipient signed up). Otherwise the cancel happens
  -- before there is anyone to notify in-app; the SMTP invite is now stale
  -- but cannot be unsent.
  if v_d.delegate_profile_id is not null then
    perform public._record_delegation_notification(
      v_d.delegate_profile_id,
      'delegation_invite_canceled',
      v_uid,
      jsonb_build_object(
        'delegation_id', v_d.id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'preset',        v_d.preset
      )
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$cancel$;

grant execute on function public.cancel_delegation_invite(uuid) to authenticated;

---------------------------------------------------------------------------
-- 3. update_delegation_permissions — sender-side permission edit on
--    an ACTIVE delegation. Sanitizes p_permissions against a whitelist
--    so the UI cannot accidentally widen the surface beyond the known
--    set. Records a before/after diff in the audit log so the receiver
--    (and ops) can audit drift over time.
---------------------------------------------------------------------------

create or replace function public.update_delegation_permissions(
  p_delegation_id uuid,
  p_permissions   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $update$
declare
  v_uid       uuid := auth.uid();
  v_now       timestamptz := now();
  v_d         record;
  v_old_perms text[];
  v_new_perms text[];
  v_added     text[];
  v_removed   text[];
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;
  if p_permissions is null then
    raise exception 'invalid_permissions' using errcode = 'P0001';
  end if;

  -- Whitelist: keep in sync with PRESET_PERMISSIONS in
  -- src/lib/supabase/delegations.ts. Unknown tokens are silently
  -- discarded.
  select array_agg(distinct p) into v_new_perms
    from unnest(p_permissions) p
   where p = any (array[
           'view',
           'edit_metadata',
           'manage_works',
           'manage_pricing',
           'reply_inquiries',
           'manage_exhibitions',
           'manage_shortlists'
         ]);

  if v_new_perms is null or array_length(v_new_perms, 1) is null then
    raise exception 'invalid_permissions' using errcode = 'P0001';
  end if;

  -- Sender + active gate
  select id, delegator_profile_id, delegate_profile_id, scope_type,
         project_id, preset, permissions
    into v_d
    from public.delegations
   where id = p_delegation_id
     and delegator_profile_id = v_uid
     and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_active');
  end if;

  v_old_perms := coalesce(v_d.permissions, '{}'::text[]);

  -- Diff. (`array_op` minus is not standard; we filter via sub-selects.)
  select array_agg(p) into v_added
    from unnest(v_new_perms) p where p <> all(v_old_perms);
  select array_agg(p) into v_removed
    from unnest(v_old_perms) p where p <> all(v_new_perms);

  -- No-op short-circuit: returning ok=true still records nothing so
  -- the recipient is not notified for a pointless save.
  if (v_added is null or array_length(v_added, 1) is null)
     and (v_removed is null or array_length(v_removed, 1) is null) then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.delegations
     set permissions = v_new_perms,
         -- Custom permission edits invalidate the preset label since the
         -- permission set no longer matches any preset's canonical list.
         preset      = null,
         updated_at  = v_now
   where id = v_d.id;

  perform public.record_delegation_event(
    v_d.id, 'permissions_updated', 'profile', v_uid,
    'Permissions updated by sender',
    jsonb_build_object(
      'before',  v_old_perms,
      'after',   v_new_perms,
      'added',   coalesce(v_added,   '{}'::text[]),
      'removed', coalesce(v_removed, '{}'::text[])
    )
  );

  if v_d.delegate_profile_id is not null then
    perform public._record_delegation_notification(
      v_d.delegate_profile_id,
      'delegation_permissions_updated',
      v_uid,
      jsonb_build_object(
        'delegation_id', v_d.id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'added',         coalesce(v_added,   '{}'::text[]),
        'removed',       coalesce(v_removed, '{}'::text[])
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'added',   coalesce(v_added,   '{}'::text[]),
    'removed', coalesce(v_removed, '{}'::text[])
  );
end;
$update$;

grant execute on function public.update_delegation_permissions(uuid, text[]) to authenticated;

---------------------------------------------------------------------------
-- 4. resign_delegation_by_delegate — recipient-side withdrawal from an
--    ACTIVE delegation. Sets status='declined' (no enum change) and
--    leaves a `delegate_resigned` audit event so we can distinguish
--    from pending-stage declines.
---------------------------------------------------------------------------

create or replace function public.resign_delegation_by_delegate(
  p_delegation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $resign$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_d   record;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  update public.delegations
     set status      = 'declined',
         declined_at = v_now,
         updated_at  = v_now
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'active'
  returning id, delegator_profile_id, scope_type, project_id, preset
       into v_d;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_active');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'delegate_resigned', 'profile', v_uid,
    'Active delegation withdrawn by delegate',
    '{}'::jsonb
  );

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_resigned',
    v_uid,
    jsonb_build_object(
      'delegation_id', v_d.id,
      'scope_type',    v_d.scope_type,
      'project_id',    v_d.project_id,
      'preset',        v_d.preset
    )
  );

  return jsonb_build_object('ok', true);
end;
$resign$;

grant execute on function public.resign_delegation_by_delegate(uuid) to authenticated;

---------------------------------------------------------------------------
-- 5. request_delegation_permission_change — recipient-side message to
--    the sender asking for a permission adjustment. Lightweight: no
--    state transition, no separate proposal table — just an audit
--    event with the proposed permission set + free-text memo, plus a
--    notification that deep-links the sender to the permission editor.
---------------------------------------------------------------------------

create or replace function public.request_delegation_permission_change(
  p_delegation_id        uuid,
  p_message              text,
  p_proposed_permissions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $request$
declare
  v_uid     uuid := auth.uid();
  v_d       record;
  v_message text;
  v_proposed text[];
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

  -- Filter proposed perms against the same whitelist as
  -- update_delegation_permissions; null array is allowed (memo-only).
  select array_agg(distinct p) into v_proposed
    from unnest(coalesce(p_proposed_permissions, '{}'::text[])) p
   where p = any (array[
           'view',
           'edit_metadata',
           'manage_works',
           'manage_pricing',
           'reply_inquiries',
           'manage_exhibitions',
           'manage_shortlists'
         ]);

  -- Recipient + active gate
  select id, delegator_profile_id, delegate_profile_id, scope_type,
         project_id, permissions
    into v_d
    from public.delegations
   where id = p_delegation_id
     and delegate_profile_id = v_uid
     and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_active');
  end if;

  perform public.record_delegation_event(
    v_d.id, 'permission_change_requested', 'profile', v_uid,
    'Permission change requested by delegate',
    jsonb_build_object(
      'message',              v_message,
      'current_permissions',  v_d.permissions,
      'proposed_permissions', coalesce(v_proposed, '{}'::text[])
    )
  );

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_permission_change_requested',
    v_uid,
    jsonb_build_object(
      'delegation_id',        v_d.id,
      'scope_type',            v_d.scope_type,
      'project_id',            v_d.project_id,
      'message',               v_message,
      'proposed_permissions',  coalesce(v_proposed, '{}'::text[])
    )
  );

  return jsonb_build_object('ok', true);
end;
$request$;

grant execute on function public.request_delegation_permission_change(uuid, text, text[]) to authenticated;
