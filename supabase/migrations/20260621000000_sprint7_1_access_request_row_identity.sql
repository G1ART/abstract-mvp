-- Sprint 7.1 Phase B — Access Request Row Identity (SECURITY DEFINER).
--
-- Adds `public.list_access_requests_for_owner_v2(...)`, an enriched
-- list RPC for the AccessRequestsPanel. Unlike the existing direct
-- PostgREST select on `access_requests`, this function:
--
--   1. Validates that the caller is the owner principal *or* an active
--      delegate writer for the principal. (Mirrors the Sprint 5/6.1
--      RLS posture, but enforced inside the function so the SECURITY
--      DEFINER body cannot be abused to read someone else's inbox.)
--
--   2. LEFT JOINs `public.profiles` for the requester id and returns
--      a tightly allowlisted set of identity fields:
--        - requester_display_name
--        - requester_username
--        - requester_avatar_url   (already public; redacted to null
--          when profile is private and viewer is not the requester)
--        - requester_main_role
--      Email, bio, roles[], is_public, private notes, and the owner's
--      audience-list membership are NEVER returned.
--
--   3. Returns ALL access_requests rows for the principal regardless
--      of which delegate writer happens to be acting (the previous
--      direct PostgREST select also returned all rows for the owner
--      principal, but only because RLS allowed it — the direct call
--      tied principal to `auth.uid()`. Sprint 7.1 Phase A already
--      threads the principal id through the client; this function is
--      the matching server-side enforcement).
--
-- Letters-only dollar tag (`$larq$`) per release-workflow.mdc, single
-- function definition (no SECTION banners required).

create or replace function public.list_access_requests_for_owner_v2(
  p_owner_profile_id uuid,
  p_status text default 'all',
  p_limit int default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $larq$
declare
  v_uid uuid := auth.uid();
  v_is_owner_or_delegate boolean;
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 200));
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'all');
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;
  if p_owner_profile_id is null then
    raise exception 'owner principal required'
      using errcode = '22023';
  end if;

  v_is_owner_or_delegate := (
    p_owner_profile_id = v_uid
    or public.is_active_account_delegate_writer(p_owner_profile_id)
  );

  if not v_is_owner_or_delegate then
    raise exception 'not allowed'
      using errcode = '42501';
  end if;

  if v_status not in ('all', 'pending', 'approved', 'declined', 'expired', 'cancelled', 'resolved') then
    v_status := 'all';
  end if;

  v_rows := (
    select coalesce(jsonb_agg(row_obj order by created_at desc), '[]'::jsonb)
    from (
      select
        ar.created_at,
        jsonb_build_object(
          'id', ar.id,
          'requester_profile_id', ar.requester_profile_id,
          'owner_profile_id', ar.owner_profile_id,
          'subject_type', ar.subject_type,
          'subject_id', ar.subject_id,
          'field_key', ar.field_key,
          'request_type', ar.request_type,
          'status', ar.status,
          'message', ar.message,
          'source_surface', ar.source_surface,
          'source_payload', ar.source_payload,
          'resolved_by', ar.resolved_by,
          'resolved_at', ar.resolved_at,
          'created_at', ar.created_at,
          'updated_at', ar.updated_at,
          'requester', case
            when p.id is null then null
            else jsonb_build_object(
              'id', p.id,
              'display_name', p.display_name,
              'username', p.username,
              'avatar_url',
                case
                  when coalesce(p.is_public, true) then p.avatar_url
                  when ar.requester_profile_id = v_uid then p.avatar_url
                  else null
                end,
              'main_role',
                case
                  when coalesce(p.is_public, true) then p.main_role
                  when ar.requester_profile_id = v_uid then p.main_role
                  else null
                end
            )
          end
        ) as row_obj
      from public.access_requests ar
      left join public.profiles p on p.id = ar.requester_profile_id
      where ar.owner_profile_id = p_owner_profile_id
        and (
          v_status = 'all'
          or (v_status = 'resolved' and ar.status in ('approved', 'declined', 'expired', 'cancelled'))
          or ar.status::text = v_status
        )
      order by ar.created_at desc
      limit v_limit
    ) sub
  );

  return jsonb_build_object('rows', v_rows);
end;
$larq$;

revoke all on function public.list_access_requests_for_owner_v2(uuid, text, int) from public;
grant execute on function public.list_access_requests_for_owner_v2(uuid, text, int) to authenticated;

comment on function public.list_access_requests_for_owner_v2(uuid, text, int) is
  'Sprint 7.1 Phase B — owner-principal-aware enriched access requests list. Caller must be owner or active delegate writer. Returns allowlisted requester identity (display_name, username, avatar_url, main_role) only; email, bio, and audience-list membership are never returned.';
