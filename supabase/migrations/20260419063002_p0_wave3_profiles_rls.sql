-- =============================================================
-- Mega Upgrade · Track 1.2 — profiles / profile_details RLS reset
-- Idempotent.
-- =============================================================
--
-- Risk being closed on public.profiles:
--   * "profiles_select_self" USING (true)  → anyone could read every
--     profile, defeating the is_public gate entirely.
--   * Duplicate insert/update policies (_self + _own) that add noise.
--
-- Final policy set (public.profiles):
--   profiles_read_public_or_self          (anon + authenticated)
--   profiles_insert_own                   (authenticated, id = auth.uid())
--   profiles_update_own                   (authenticated, id = auth.uid())
--
-- Final policy set (public.profile_details):
--   profile_details_select_self           (authenticated, user_id = auth.uid())
--   profile_details_insert_self           (authenticated, user_id = auth.uid())
--   profile_details_update_self           (authenticated, user_id = auth.uid())
-- =============================================================

-- -------------------------------------------------------------
-- public.profiles
-- -------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public_or_self"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_public_or_self"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_write"             ON public.profiles;

CREATE POLICY "profiles_read_public_or_self"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    COALESCE(is_public, true) = true
    OR id = auth.uid()
  );

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -------------------------------------------------------------
-- public.profile_details — strictly self-scoped
-- -------------------------------------------------------------
ALTER TABLE public.profile_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_details_select_self"      ON public.profile_details;
DROP POLICY IF EXISTS "profile_details_select_own"       ON public.profile_details;
DROP POLICY IF EXISTS "profile_details_insert_self"      ON public.profile_details;
DROP POLICY IF EXISTS "profile_details_upsert_own"       ON public.profile_details;
DROP POLICY IF EXISTS "profile_details_update_self"      ON public.profile_details;
DROP POLICY IF EXISTS "profile_details_update_own"       ON public.profile_details;

CREATE POLICY "profile_details_select_self"
  ON public.profile_details
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profile_details_insert_self"
  ON public.profile_details
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profile_details_update_self"
  ON public.profile_details
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
