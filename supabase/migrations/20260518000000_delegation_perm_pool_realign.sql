-- ============================================================
-- 20260518000000_delegation_perm_pool_realign.sql
-- ------------------------------------------------------------
-- CRITICAL — realigns the delegation permission pool to match the
-- RLS keys actually used in production.
--
-- Background (audit, 2026-04-29):
--
--   PR-B (20260515000000_delegation_lifecycle_actions.sql) introduced
--   `update_delegation_permissions` and `request_delegation_permission_change`
--   with a sanitization whitelist of seven keys:
--       view, edit_metadata, manage_works, manage_pricing,
--       reply_inquiries, manage_exhibitions, manage_shortlists
--
--   But the *write-side RLS policies* in
--   20260505000100_delegation_account_rls_writer.sql gate on a
--   different vocabulary:
--       manage_artworks, manage_inquiries, manage_claims,
--       edit_profile_public_content
--   plus the unchanged trio (view, edit_metadata, manage_works,
--   manage_exhibitions).
--
--   Net effect:
--   • Every preset ('operations'/'content'/etc.) seeds delegations
--     with the legacy keys (`manage_artworks`, `manage_inquiries`,
--     `manage_claims`, `edit_profile_public_content`). When the sender
--     opened UpdatePermissionsModal and saved — even unchanged — the
--     PR-B whitelist DROPPED all of those legacy keys silently. The
--     recipient lost artwork/inquiry/claim authority without notice.
--   • The new keys (`manage_pricing`, `reply_inquiries`,
--     `manage_shortlists`) were toggle-able in the UI but had ZERO
--     effect server-side: no RLS policy reads them, so no actual
--     surface unlocked.
--
-- Source of truth: RLS. We realign both the SQL whitelists *and* the
-- two client modals (UpdatePermissionsModal / RequestPermissionChangeModal)
-- onto the canonical eight-key pool. The legacy enum
-- `delegation_permission_keys` from 20260503000000 already accepts
-- this exact set, so no schema migration is needed — only the
-- function bodies + a new dismissal RPC for senders to refuse a
-- pending change request without having to "save no-op" through the
-- editor.
--
-- Companion client patch:
--   src/components/delegation/UpdatePermissionsModal.tsx
--   src/components/delegation/RequestPermissionChangeModal.tsx
--   src/components/delegation/DelegationDetailDrawer.tsx
--   src/lib/supabase/delegations.ts
--
-- Safe to re-run.
-- ============================================================

-- == SECTION 1 ==
-- update_delegation_permissions: realign whitelist with RLS keys.

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

  -- Canonical RLS-anchored permission pool. Keep in sync with
  -- ALL_PERMISSIONS in src/components/delegation/{Update,Request}*.tsx
  -- and `delegation.permissionLabel.*` i18n keys.
  select array_agg(distinct p) into v_new_perms
    from unnest(p_permissions) p
   where p = any (array[
           'view',
           'edit_metadata',
           'manage_works',
           'manage_artworks',
           'manage_exhibitions',
           'manage_inquiries',
           'manage_claims',
           'edit_profile_public_content'
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

  -- Always clear stale change-request notifications on save (incl.
  -- no-op): the sender has explicitly acknowledged the request.
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
-- request_delegation_permission_change: realign whitelist + keep
-- collapsing stacked notifications.

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
           'manage_artworks',
           'manage_exhibitions',
           'manage_inquiries',
           'manage_claims',
           'edit_profile_public_content'
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

-- == SECTION 3 ==
-- dismiss_delegation_permission_change_request — sender-side explicit
-- "no, I won't change the permissions" path. Without this RPC the
-- sender could only resolve a request implicitly (open the editor,
-- save no-op). The dismissal:
--
--   • clears all `delegation_permission_change_requested` notifications
--     for this (sender, delegation) pair so the inbox returns to idle;
--   • records a `permission_change_dismissed` audit event so the
--     recipient can see in the activity feed that their request was
--     declined (the audit log is the canonical history);
--   • notifies the recipient with `delegation_permission_change_dismissed`
--     so they get the same in-app affordance as for accepts.
--
-- The delegation row itself does NOT change state — the recipient
-- continues operating with their existing permission set, exactly
-- like before the request.

create or replace function public.dismiss_delegation_permission_change_request(
  p_delegation_id uuid,
  p_message       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $c$
declare
  v_uid     uuid := auth.uid();
  v_d       record;
  v_message text;
begin
  if v_uid is null then
    raise exception 'permission_denied' using errcode = 'P0001';
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');

  select id, delegator_profile_id, delegate_profile_id, scope_type,
         project_id, permissions
    into v_d
    from public.delegations
   where id = p_delegation_id
     and delegator_profile_id = v_uid
     and status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found_or_not_active');
  end if;

  delete from public.notifications
   where user_id = v_uid
     and type = 'delegation_permission_change_requested'
     and (payload ->> 'delegation_id')::uuid = v_d.id;

  perform public.record_delegation_event(
    v_d.id, 'permission_change_dismissed', 'profile', v_uid,
    coalesce(v_message, 'Sender declined the permission change request'),
    jsonb_build_object('message', v_message)
  );

  if v_d.delegate_profile_id is not null then
    perform public._record_delegation_notification(
      v_d.delegate_profile_id,
      'delegation_permission_change_dismissed',
      v_uid,
      jsonb_build_object(
        'delegation_id', v_d.id,
        'scope_type',    v_d.scope_type,
        'project_id',    v_d.project_id,
        'message',       v_message
      )
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$c$;

grant execute on function public.dismiss_delegation_permission_change_request(uuid, text)
  to authenticated;

-- == SECTION 4 ==
-- Extend `notifications_type_check` to allow the new dismissal type
-- so SECURITY DEFINER inserts from `_record_delegation_notification`
-- aren't rejected. Mirrors the latest superset (20260515000000)
-- verbatim plus the new key. Idempotent.

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
    'follow_request','follow_request_accepted',
    'delegation_invite_canceled',
    'delegation_resigned',
    'delegation_permissions_updated',
    'delegation_permission_change_requested',
    -- PR realign (this migration):
    'delegation_permission_change_dismissed'
  ]));
