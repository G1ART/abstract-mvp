-- =============================================================
-- Onboarding Identity Overhaul — Track A / Track B / Track L
-- Idempotent.
-- =============================================================
--
-- Goals:
--   1. Make identity completeness a first-class signal in the
--      authoritative auth-state RPC. `profiles` row existence is
--      no longer enough to consider a user "onboarded"; placeholder
--      usernames, blank display_name, and empty roles must also
--      block entry into product surfaces.
--   2. Provide ONE canonical placeholder-username detector
--      (`public.is_placeholder_username`) so DB, ops, and client
--      helpers cannot drift apart.
--   3. Expose a username-availability RPC that reuses the same
--      placeholder rule plus basic reserved-name hygiene.
--   4. Point ops reporting at the canonical helper.
--   5. Expose a lightweight rescue-stats view for beta ops.
--
-- This migration is ADDITIVE:
--   * get_my_auth_state keeps every pre-existing column and adds
--     new ones (display_name, is_placeholder_username,
--     needs_identity_setup). Older clients that ignore the new
--     columns keep working.
--   * ensure_my_profile / ensure_profile_row are untouched — Track
--     C intentionally keeps row bootstrap, the new gate catches
--     placeholder rows in the app layer.
-- =============================================================


-- ─── 1. Canonical placeholder detector ───────────────────────

CREATE OR REPLACE FUNCTION public.is_placeholder_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_username IS NOT NULL
    AND lower(btrim(p_username)) ~ '^user_[a-f0-9]{6,16}$';
$$;

COMMENT ON FUNCTION public.is_placeholder_username(text) IS
  'Canonical placeholder-username detector. Matches both legacy 8-hex (ensure_profile_row) and 12-hex (profiles_username_autogen trigger) variants, plus any future 6–16 hex variant.';

GRANT EXECUTE ON FUNCTION public.is_placeholder_username(text) TO anon, authenticated;


-- ─── 2. Auth-state RPC — ADDITIVE expansion ──────────────────

DROP FUNCTION IF EXISTS public.get_my_auth_state();

CREATE OR REPLACE FUNCTION public.get_my_auth_state()
RETURNS TABLE(
  user_id                  uuid,
  has_password             boolean,
  is_email_confirmed       boolean,
  needs_onboarding         boolean,
  username                 text,
  display_name             text,
  is_placeholder_username  boolean,
  needs_identity_setup     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_uid                                                                         AS user_id,
    (au.encrypted_password IS NOT NULL AND au.encrypted_password <> '')::boolean  AS has_password,
    (au.email_confirmed_at IS NOT NULL)::boolean                                  AS is_email_confirmed,
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid)               AS needs_onboarding,
    (SELECT p.username     FROM public.profiles p WHERE p.id = v_uid)             AS username,
    (SELECT p.display_name FROM public.profiles p WHERE p.id = v_uid)             AS display_name,
    COALESCE(
      public.is_placeholder_username(
        (SELECT p.username FROM public.profiles p WHERE p.id = v_uid)
      ),
      false
    )                                                                             AS is_placeholder_username,
    (
      NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid)
      OR EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = v_uid
           AND (
             public.is_placeholder_username(p.username)
             OR btrim(COALESCE(p.display_name, '')) = ''
             OR p.roles IS NULL
             OR array_length(p.roles, 1) IS NULL
             OR p.main_role IS NULL
             OR btrim(p.main_role) = ''
           )
      )
    )                                                                             AS needs_identity_setup
    FROM auth.users au
   WHERE au.id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_auth_state() TO anon, authenticated;


-- ─── 3. Username availability RPC ─────────────────────────────

CREATE OR REPLACE FUNCTION public.check_username_availability(p_username text)
RETURNS TABLE(
  available boolean,
  reason    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_normalized text := lower(btrim(COALESCE(p_username, '')));
BEGIN
  IF v_normalized = '' THEN
    RETURN QUERY SELECT false AS available, 'empty'::text AS reason;
    RETURN;
  END IF;

  IF length(v_normalized) < 3 OR length(v_normalized) > 20 THEN
    RETURN QUERY SELECT false AS available, 'invalid'::text AS reason;
    RETURN;
  END IF;

  IF v_normalized !~ '^[a-z0-9_]+$' THEN
    RETURN QUERY SELECT false AS available, 'invalid'::text AS reason;
    RETURN;
  END IF;

  IF public.is_placeholder_username(v_normalized) THEN
    RETURN QUERY SELECT false AS available, 'reserved'::text AS reason;
    RETURN;
  END IF;

  IF v_normalized IN (
    'admin', 'administrator', 'root', 'support', 'help',
    'abstract', 'official', 'api', 'me', 'my', 'anon',
    'system', 'null', 'undefined'
  ) THEN
    RETURN QUERY SELECT false AS available, 'reserved'::text AS reason;
    RETURN;
  END IF;

  -- Already owned by current user → allow (idempotent save).
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.username = v_normalized
       AND p.id = v_uid
  ) THEN
    RETURN QUERY SELECT true AS available, 'self'::text AS reason;
    RETURN;
  END IF;

  -- Taken by someone else.
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.username = v_normalized
  ) THEN
    RETURN QUERY SELECT false AS available, 'taken'::text AS reason;
    RETURN;
  END IF;

  RETURN QUERY SELECT true AS available, 'available'::text AS reason;
END;
$$;

COMMENT ON FUNCTION public.check_username_availability(text) IS
  'Check if a username is available for the current user. Returns reasons: available, self, taken, invalid, reserved, empty.';

GRANT EXECUTE ON FUNCTION public.check_username_availability(text) TO anon, authenticated;


-- ─── 4. ops_onboarding_summary — canonical placeholder ────────

CREATE OR REPLACE FUNCTION public.ops_onboarding_summary()
RETURNS TABLE(
  profile_id          uuid,
  username            text,
  display_name        text,
  email               text,
  has_random_username boolean,
  artwork_count       bigint,
  created_at          timestamptz,
  delegation_count    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id                                             AS profile_id,
      p.username,
      p.display_name,
      u.email::text                                    AS email,
      COALESCE(public.is_placeholder_username(p.username), false)
                                                       AS has_random_username,
      (SELECT count(*) FROM public.artworks a
         WHERE a.artist_id = p.id)                     AS artwork_count,
      p.created_at,
      (SELECT count(*) FROM public.delegations d
         WHERE d.delegator_profile_id = p.id
           AND d.status = 'active')                    AS delegation_count
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END;
$$;


-- ─── 5. v_identity_rescue_stats — beta ops visibility ────────
--
-- Simple roll-up so operators can confirm placeholder users are
-- being rerouted and fixed over time. Counts new placeholder rows
-- created in 7/30-day windows and "rescued" rows that currently
-- hold a clean username but were updated recently (proxy for
-- identity-finish completion — exact transition history is not
-- tracked).

DROP VIEW IF EXISTS public.v_identity_rescue_stats;

CREATE VIEW public.v_identity_rescue_stats
WITH (security_invoker = true)
AS
SELECT
  (SELECT count(*) FROM public.profiles p
     WHERE public.is_placeholder_username(p.username))            AS placeholder_total,
  (SELECT count(*) FROM public.profiles p
     WHERE public.is_placeholder_username(p.username)
       AND p.created_at >= now() - interval '7 days')             AS placeholder_created_7d,
  (SELECT count(*) FROM public.profiles p
     WHERE public.is_placeholder_username(p.username)
       AND p.created_at >= now() - interval '30 days')            AS placeholder_created_30d,
  (SELECT count(*) FROM public.profiles p
     WHERE NOT public.is_placeholder_username(p.username)
       AND p.profile_updated_at IS NOT NULL
       AND p.profile_updated_at >= now() - interval '7 days'
       AND p.profile_updated_at > p.created_at + interval '1 minute')
                                                                  AS rescued_7d,
  (SELECT count(*) FROM public.profiles p
     WHERE NOT public.is_placeholder_username(p.username)
       AND p.profile_updated_at IS NOT NULL
       AND p.profile_updated_at >= now() - interval '30 days'
       AND p.profile_updated_at > p.created_at + interval '1 minute')
                                                                  AS rescued_30d;

COMMENT ON VIEW public.v_identity_rescue_stats IS
  'Aggregate counts of placeholder profiles and recent rescues. Uses security_invoker so callers see only what their RLS permits on profiles.';

GRANT SELECT ON public.v_identity_rescue_stats TO anon, authenticated;
