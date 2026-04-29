-- ============================================================
-- 20260517000000_delegation_perm_change_cleanup.sql
-- ------------------------------------------------------------
-- Hotfix bundle for "권한 변경 요청 알림이 사라지지 않고 모달이
-- 반복해서 켜진다" (QA, 2026-04-29).
--
-- Two server-side leaks that the client cannot work around alone:
--
--   1. update_delegation_permissions() does NOT delete the sender's
--      `delegation_permission_change_requested` notification(s)
--      when the request gets resolved (approved/modified/superseded).
--      Inbox keeps the old chip forever, deep-link keeps re-firing.
--
--   2. request_delegation_permission_change() can stack multiple
--      `delegation_permission_change_requested` notifications on the
--      sender if the recipient submits the form more than once. The
--      sender ends up with N rows that all deep-link into the same
--      delegation, all firing the modal one after another.
--
-- Both functions are redefined below to clean up notifications
-- inside the same transaction. Audit-log events are *not* touched —
-- those are the source of truth for history; notifications are an
-- inbox-only concern that should be ephemeral.
--
-- Companion client guards: src/components/delegation/
--   DelegationDetailDrawer.tsx
--     • deep-link `setUpdateOpen(true)` runs once per open
--     • amber pending card hides when a `permissions_updated`
--       event has been recorded after the latest request
--
-- Safe to re-run.
-- ============================================================

-- == SECTION 1 ==
-- update_delegation_permissions: clear the sender's pending
-- "permission change requested" notifications upon successful save.

create or replace function public.update_delegation_permissions(
  p_delegation_id uuid,
  p_permissions   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $a$
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

  select array_agg(p) into v_added
    from unnest(v_new_perms) p where p <> all(v_old_perms);
  select array_agg(p) into v_removed
    from unnest(v_old_perms) p where p <> all(v_new_perms);

  -- No-op short-circuit: even on a no-op we still clear any pending
  -- permission-change-request notifications, because the sender has
  -- explicitly chosen to acknowledge the request (saved with no
  -- diff = "ignore the request"). Otherwise the inbox chip would
  -- linger after the user already dismissed it intentionally.
  delete from public.notifications
   where user_id = v_uid
     and type = 'delegation_permission_change_requested'
     and (payload ->> 'delegation_id')::uuid = v_d.id;

  if (v_added is null or array_length(v_added, 1) is null)
     and (v_removed is null or array_length(v_removed, 1) is null) then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.delegations
     set permissions = v_new_perms,
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
$a$;

grant execute on function public.update_delegation_permissions(uuid, text[]) to authenticated;

-- == SECTION 2 ==
-- request_delegation_permission_change: collapse stacked requests so
-- the sender's inbox shows at most one pending chip per delegation.
-- Existing pending request notifications for the same delegation are
-- removed before the new one is inserted.

create or replace function public.request_delegation_permission_change(
  p_delegation_id        uuid,
  p_message              text,
  p_proposed_permissions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $b$
declare
  v_uid      uuid := auth.uid();
  v_d        record;
  v_proposed text[];
  v_message  text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

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

  -- Collapse any stacked pending notifications so the inbox shows
  -- exactly one chip with the latest proposal/memo.
  delete from public.notifications
   where user_id = v_d.delegator_profile_id
     and type = 'delegation_permission_change_requested'
     and (payload ->> 'delegation_id')::uuid = v_d.id;

  perform public._record_delegation_notification(
    v_d.delegator_profile_id,
    'delegation_permission_change_requested',
    v_uid,
    jsonb_build_object(
      'delegation_id',        v_d.id,
      'scope_type',           v_d.scope_type,
      'project_id',           v_d.project_id,
      'message',              v_message,
      'proposed_permissions', coalesce(v_proposed, '{}'::text[])
    )
  );

  return jsonb_build_object(
    'ok',                   true,
    'proposed_permissions', coalesce(v_proposed, '{}'::text[])
  );
end;
$b$;

grant execute on function public.request_delegation_permission_change(uuid, text, text[])
  to authenticated;
