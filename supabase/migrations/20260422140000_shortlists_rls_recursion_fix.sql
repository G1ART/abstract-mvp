-- =============================================================
-- Fix: infinite recursion in shortlist / collaborator / items RLS
-- =============================================================
--
-- Symptom (Supabase postgres logs):
--   ERROR: infinite recursion detected in policy for relation "shortlists"
--
-- Cause:
--   • `shortlists.shortlists_collab_select`  → EXISTS on shortlist_collaborators
--   • `shortlist_collaborators.shortlist_collab_owner_manage` (FOR ALL)
--        → EXISTS on shortlists
--   Both are PERMISSIVE, so during a SELECT on shortlists, Postgres OR-s
--   all policy qual predicates. Each EXISTS triggers RLS on the other
--   table, whose policies reference us back → mutual cycle.
--   Postgres detects this and aborts ANY read/insert on shortlists
--   (PostgREST's returning=representation makes even INSERT fail).
--
-- Fix:
--   Replace cross-table EXISTS predicates in policies with
--   `SECURITY DEFINER` helper functions. SECURITY DEFINER bypasses
--   RLS when it reads the related table inside the function body,
--   so the outer policy never re-enters the partner table's RLS.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ── Helper functions ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_shortlist_owner(_sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shortlists
     WHERE id = _sid AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shortlist_collaborator(_sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shortlist_collaborators
     WHERE shortlist_id = _sid AND profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shortlist_editor(_sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shortlist_collaborators
     WHERE shortlist_id = _sid
       AND profile_id = auth.uid()
       AND role = 'editor'
  );
$$;

REVOKE ALL ON FUNCTION public.is_shortlist_owner(uuid)        FROM public;
REVOKE ALL ON FUNCTION public.is_shortlist_collaborator(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_shortlist_editor(uuid)       FROM public;
GRANT EXECUTE ON FUNCTION public.is_shortlist_owner(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shortlist_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shortlist_editor(uuid)       TO authenticated;

-- ── shortlists ────────────────────────────────────────────────

DROP POLICY IF EXISTS "shortlists_collab_select" ON public.shortlists;
CREATE POLICY "shortlists_collab_select"
  ON public.shortlists
  FOR SELECT
  USING (public.is_shortlist_collaborator(id));
-- shortlists_owner_all stays as-is (flat predicate: owner_id = auth.uid())

-- ── shortlist_collaborators ───────────────────────────────────

DROP POLICY IF EXISTS "shortlist_collab_owner_manage" ON public.shortlist_collaborators;
CREATE POLICY "shortlist_collab_owner_manage"
  ON public.shortlist_collaborators
  FOR ALL
  USING (public.is_shortlist_owner(shortlist_id))
  WITH CHECK (public.is_shortlist_owner(shortlist_id));
-- shortlist_collab_self_select stays as-is (flat predicate: profile_id = auth.uid())

-- ── shortlist_items ───────────────────────────────────────────

DROP POLICY IF EXISTS "shortlist_items_owner" ON public.shortlist_items;
CREATE POLICY "shortlist_items_owner"
  ON public.shortlist_items
  FOR ALL
  USING (public.is_shortlist_owner(shortlist_id))
  WITH CHECK (public.is_shortlist_owner(shortlist_id));

DROP POLICY IF EXISTS "shortlist_items_collab_select" ON public.shortlist_items;
CREATE POLICY "shortlist_items_collab_select"
  ON public.shortlist_items
  FOR SELECT
  USING (public.is_shortlist_collaborator(shortlist_id));

DROP POLICY IF EXISTS "shortlist_items_collab_editor" ON public.shortlist_items;
CREATE POLICY "shortlist_items_collab_editor"
  ON public.shortlist_items
  FOR ALL
  USING (public.is_shortlist_editor(shortlist_id))
  WITH CHECK (public.is_shortlist_editor(shortlist_id));

-- ── shortlist_views (owner SELECT referenced shortlists; swap too) ─

DROP POLICY IF EXISTS "shortlist_views_owner_select" ON public.shortlist_views;
CREATE POLICY "shortlist_views_owner_select"
  ON public.shortlist_views
  FOR SELECT
  USING (public.is_shortlist_owner(shortlist_id));
