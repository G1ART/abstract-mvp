-- =============================================================
-- Acting-as storage lifecycle hardening — `artworks` bucket.
--
-- Why
-- ----
-- The original `can_manage_artworks_storage_path()` (see
-- 20260419063001_p0_wave3_storage_policies.sql) only knows two ownership
-- shapes for objects in the `artworks` bucket:
--   a) owner folder      → path begins with "{auth.uid()}/..."
--   b) exhibition-media  → "exhibition-media/{exhibition_id}/..." with
--                          curator/host or active project-scope delegate.
--
-- That misses the account-scope acting-as scenario:
--   * Operator B is an active account-scope writer delegate of principal A.
--   * B uploads an image while acting-as A. The path lands under
--     "{B}/...". Currently:
--       - A cannot delete that object via storage RLS (A ≠ folder owner),
--         so an `artwork.delete` cascade silently leaks the storage row
--         and you end up with orphaned bytes.
--       - Another active delegate C of A cannot clean it up either.
--   * Going forward we also want B to be able to upload **into A's
--     folder** (`{A}/...`) so future objects live under principal-rooted
--     paths and the lifecycle becomes A-centric.
--
-- This migration is additive and idempotent: it only relaxes write/delete
-- access to paths whose folder owner is involved in an *active*
-- account-scope writer delegation that includes the caller. SELECT
-- policy is unchanged (the bucket is still publicly readable).
--
-- Safety
-- ------
-- * The helper checks `delegations.scope_type = 'account'` and
--   `status = 'active'`, so revoking a delegation immediately removes
--   storage access on next call — no caching window.
-- * The helper does NOT broaden access to arbitrary buckets — it only
--   feeds the existing four `artworks_*` policies which all already
--   filter on `bucket_id = 'artworks'`.
-- =============================================================

CREATE OR REPLACE FUNCTION public.can_manage_artworks_storage_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[];
  v_exhibition_id uuid;
  v_folder_owner uuid;
BEGIN
  IF auth.uid() IS NULL OR p_name IS NULL THEN
    RETURN false;
  END IF;

  v_parts := storage.foldername(p_name);
  IF array_length(v_parts, 1) IS NULL THEN
    RETURN false;
  END IF;

  -- a) owner folder
  IF v_parts[1] = auth.uid()::text THEN
    RETURN true;
  END IF;

  -- a-bis) account-scope delegate writer reach.
  --
  -- The first segment is interpreted as a profile id. Two new shapes are
  -- accepted:
  --   1. The current user is an *active account-scope writer delegate*
  --      of the folder owner. This lets a delegate upload directly into
  --      the principal's folder (path scheme: "{principal}/...") which
  --      gives lifecycle control to the principal automatically.
  --   2. The folder owner is one of the current user's *active
  --      account-scope writer delegates*. This lets a principal (or
  --      another writer delegate of the same principal) clean up
  --      objects that landed under the delegate's folder during legacy
  --      acting-as uploads.
  BEGIN
    v_folder_owner := v_parts[1]::uuid;
  EXCEPTION WHEN others THEN
    v_folder_owner := NULL;
  END;

  IF v_folder_owner IS NOT NULL THEN
    -- Shape 1: caller writes/cleans inside principal's folder.
    IF EXISTS (
      SELECT 1
        FROM public.delegations d
       WHERE d.delegator_profile_id = v_folder_owner
         AND d.delegate_profile_id  = auth.uid()
         AND d.scope_type           = 'account'
         AND d.status               = 'active'
    ) THEN
      RETURN true;
    END IF;

    -- Shape 2: caller cleans inside one of their active delegates' folders.
    IF EXISTS (
      SELECT 1
        FROM public.delegations d
       WHERE d.delegator_profile_id = auth.uid()
         AND d.delegate_profile_id  = v_folder_owner
         AND d.scope_type           = 'account'
         AND d.status               = 'active'
    ) THEN
      RETURN true;
    END IF;

    -- Shape 3: caller and folder owner share a common principal — both
    -- are active account-scope writer delegates of the same person, so
    -- one delegate can clean up another delegate's leftovers.
    IF EXISTS (
      SELECT 1
        FROM public.delegations d_owner
        JOIN public.delegations d_caller
          ON d_owner.delegator_profile_id = d_caller.delegator_profile_id
       WHERE d_owner.delegate_profile_id = v_folder_owner
         AND d_owner.scope_type          = 'account'
         AND d_owner.status              = 'active'
         AND d_caller.delegate_profile_id = auth.uid()
         AND d_caller.scope_type          = 'account'
         AND d_caller.status              = 'active'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- b) exhibition-media/{uuid}/...
  IF v_parts[1] = 'exhibition-media' AND array_length(v_parts, 1) >= 2 THEN
    BEGIN
      v_exhibition_id := v_parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;

    RETURN EXISTS (
      SELECT 1
        FROM public.projects p
       WHERE p.id = v_exhibition_id
         AND (
              p.curator_id      = auth.uid()
           OR p.host_profile_id = auth.uid()
         )
    )
    OR EXISTS (
      SELECT 1
        FROM public.delegations d
       WHERE d.project_id          = v_exhibition_id
         AND d.delegate_profile_id = auth.uid()
         AND d.scope_type          = 'project'
         AND d.status              = 'active'
         AND (
              'edit_metadata' = ANY(d.permissions)
           OR 'manage_works'  = ANY(d.permissions)
         )
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_artworks_storage_path(text) TO anon, authenticated, service_role;
