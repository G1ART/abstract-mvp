-- Delegation upgrade phase 1: schema additions (additive only).
--
-- Adds:
--   - delegation_status_type values: 'declined', 'expired'
--   - delegation_preset_type enum
--   - delegations lifecycle columns (invited_at, accepted_at, declined_at,
--     revoked_at, expires_at, invited_by, revoked_by, note, preset)
--   - delegation_preset_permissions(p) helper (single source of truth for
--     preset -> permission[] expansion)
--
-- Notes:
--   - Existing rows: invited_at backfilled from created_at.
--   - Existing 'revoked' rows that were technically "declined" remain as-is
--     (read-only compatibility); new declines write 'declined'.
--   - No RLS or policy bodies are changed in this migration.

-- 1) Status enum: add 'declined' and 'expired' (additive, idempotent).
alter type public.delegation_status_type add value if not exists 'declined' before 'revoked';
alter type public.delegation_status_type add value if not exists 'expired' after 'revoked';

-- 2) Preset enum.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'delegation_preset_type' and n.nspname = 'public'
  ) then
    create type public.delegation_preset_type as enum (
      'operations',
      'content',
      'review',
      'project_co_edit',
      'project_works_only',
      'project_review'
    );
  end if;
end $$;

-- 3) Lifecycle + meta columns on delegations (additive).
alter table public.delegations
  add column if not exists invited_at   timestamptz,
  add column if not exists accepted_at  timestamptz,
  add column if not exists declined_at  timestamptz,
  add column if not exists revoked_at   timestamptz,
  add column if not exists expires_at   timestamptz,
  add column if not exists invited_by   uuid references public.profiles(id) on delete set null,
  add column if not exists revoked_by   uuid references public.profiles(id) on delete set null,
  add column if not exists note         text,
  add column if not exists preset       public.delegation_preset_type;

-- 4) Backfill invited_at for existing rows.
update public.delegations
   set invited_at = created_at
 where invited_at is null;

-- 5) Index on (status, delegator) for hub list filtering.
create index if not exists idx_delegations_delegator_status
  on public.delegations(delegator_profile_id, status);
create index if not exists idx_delegations_delegate_status
  on public.delegations(delegate_profile_id, status);

-- 6) Preset -> permissions[] map. Single source of truth.
--    Account presets:
--      operations         -> manage everything except security/billing
--      content            -> manage public-facing artwork/exhibition content
--      review             -> view-only audit
--    Project presets:
--      project_co_edit    -> edit metadata + manage works
--      project_works_only -> manage works only
--      project_review     -> view-only
create or replace function public.delegation_preset_permissions(
  p public.delegation_preset_type
) returns text[]
language sql
immutable
set search_path = public
as $$
  select case p
    when 'operations' then array[
      'view',
      'edit_metadata',
      'manage_works',
      'manage_artworks',
      'manage_exhibitions',
      'manage_inquiries',
      'manage_claims'
    ]
    when 'content' then array[
      'view',
      'edit_metadata',
      'manage_works',
      'manage_artworks',
      'manage_exhibitions',
      'edit_profile_public_content'
    ]
    when 'review' then array['view']
    when 'project_co_edit' then array[
      'view',
      'edit_metadata',
      'manage_works'
    ]
    when 'project_works_only' then array[
      'view',
      'manage_works'
    ]
    when 'project_review' then array['view']
  end;
$$;

grant execute on function public.delegation_preset_permissions(public.delegation_preset_type)
  to authenticated, anon;

-- 7) Helper: validate preset/scope compatibility.
create or replace function public.delegation_preset_is_valid_for_scope(
  p public.delegation_preset_type,
  s public.delegation_scope_type
) returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p in ('operations','content','review') and s = 'account' then true
    when p in ('project_co_edit','project_works_only','project_review') and s = 'project' then true
    else false
  end;
$$;

grant execute on function public.delegation_preset_is_valid_for_scope(
  public.delegation_preset_type, public.delegation_scope_type
) to authenticated, anon;
