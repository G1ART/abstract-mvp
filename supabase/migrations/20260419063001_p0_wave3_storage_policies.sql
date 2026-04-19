-- =============================================================
-- Mega Upgrade · Track 1.1 — storage.objects policy rewrite
-- Idempotent. Single bucket in use: 'artworks' (also hosts
-- exhibition-media/{exhibition_id}/... paths).
-- =============================================================
--
-- Risk being closed:
--   * "Delete_auth 1exduyn_0"  FOR DELETE TO public USING bucket_id='artworks'
--     → anyone could delete any object in the artworks bucket.
--   * "Insert_public 1exduyn_0" FOR INSERT TO authenticated
--     WITH CHECK bucket_id='artworks' (no folder-ownership check).
--   * Duplicate / mis-named SELECT policies.
--
-- Final policy set (artworks bucket):
--   artworks_public_read                — anyone may read
--   artworks_owner_insert               — owner folder (or exhibition member)
--   artworks_owner_update               — owner folder (or exhibition member)
--   artworks_owner_delete               — owner folder (or exhibition member)
-- =============================================================

-- 1) Drop legacy / unsafe policies (IF EXISTS so migration stays idempotent).
DROP POLICY IF EXISTS "Allow owner delete artworks storage" ON storage.objects;
DROP POLICY IF EXISTS "Delete_auth 1exduyn_0" ON storage.objects;
DROP POLICY IF EXISTS "Delete_auth 1exduyn_1" ON storage.objects;
DROP POLICY IF EXISTS "Insert_public 1exduyn_0" ON storage.objects;
DROP POLICY IF EXISTS "Select_public 1exduyn_0" ON storage.objects;
DROP POLICY IF EXISTS "artworks_public_read" ON storage.objects;
DROP POLICY IF EXISTS "artworks_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "artworks_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "artworks_owner_delete" ON storage.objects;

-- 2) Helper: is the given artworks-bucket object path managed by the
--    current user? Two legitimate ownership shapes are in production:
--      a) user-folder          → path begins with "{auth.uid()}/..."
--      b) exhibition-media     → path begins with "exhibition-media/{exhibition_id}/..."
--         (curator / host / active project-scope delegate)
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

-- 3) Re-create the four canonical policies.
CREATE POLICY "artworks_public_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'artworks');

CREATE POLICY "artworks_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'artworks'
    AND public.can_manage_artworks_storage_path(name)
  );

CREATE POLICY "artworks_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'artworks'
    AND public.can_manage_artworks_storage_path(name)
  )
  WITH CHECK (
    bucket_id = 'artworks'
    AND public.can_manage_artworks_storage_path(name)
  );

CREATE POLICY "artworks_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'artworks'
    AND public.can_manage_artworks_storage_path(name)
  );
