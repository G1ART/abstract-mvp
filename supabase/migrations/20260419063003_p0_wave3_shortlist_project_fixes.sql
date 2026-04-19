-- =============================================================
-- Mega Upgrade · Track 1.3 — structural policy typo fixes
-- Idempotent.
-- =============================================================
--
-- Fixes two self-join mistakes that shipped earlier:
--
--   * shortlists_collab_select
--       WHERE sc.shortlist_id = sc.id       -- always true if both null,
--                                           -- never joins shortlists
--     → fix: sc.shortlist_id = shortlists.id
--
--   * projects_update_curator_or_delegate  (USING and WITH CHECK)
--       WHERE d.project_id = d.id           -- delegations row joined to
--                                           -- itself, delegate path never
--                                           -- resolves
--     → fix: d.project_id = projects.id
-- =============================================================

-- shortlists_collab_select --------------------------------------------------
DROP POLICY IF EXISTS "shortlists_collab_select" ON public.shortlists;

CREATE POLICY "shortlists_collab_select"
  ON public.shortlists
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.shortlist_collaborators sc
       WHERE sc.shortlist_id = shortlists.id
         AND sc.profile_id   = auth.uid()
    )
  );

-- projects_update_curator_or_delegate --------------------------------------
DROP POLICY IF EXISTS "projects_update_curator_or_delegate" ON public.projects;

CREATE POLICY "projects_update_curator_or_delegate"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    curator_id      = auth.uid()
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.delegations d
       WHERE d.project_id          = projects.id
         AND d.delegate_profile_id = auth.uid()
         AND d.scope_type          = 'project'::public.delegation_scope_type
         AND d.status              = 'active'::public.delegation_status_type
         AND (
              'edit_metadata' = ANY(d.permissions)
           OR 'manage_works'  = ANY(d.permissions)
         )
    )
  )
  WITH CHECK (
    curator_id      = auth.uid()
    OR host_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.delegations d
       WHERE d.project_id          = projects.id
         AND d.delegate_profile_id = auth.uid()
         AND d.scope_type          = 'project'::public.delegation_scope_type
         AND d.status              = 'active'::public.delegation_status_type
         AND (
              'edit_metadata' = ANY(d.permissions)
           OR 'manage_works'  = ANY(d.permissions)
         )
    )
  );
