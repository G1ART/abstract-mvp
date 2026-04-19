-- =============================================================
-- Mega Upgrade · Track 1.4 — authoritative auth state RPC
-- Idempotent.
-- =============================================================
--
-- Removes the app's dependence on localStorage("has_password").
-- Clients call get_my_auth_state() and route from the returned
-- { has_password, is_email_confirmed, needs_onboarding, username }
-- tuple. The RPC reads auth.users directly through SECURITY DEFINER,
-- so the device/browser/tab can no longer lie about password state.
-- =============================================================

DROP FUNCTION IF EXISTS public.get_my_auth_state();

CREATE OR REPLACE FUNCTION public.get_my_auth_state()
RETURNS TABLE(
  user_id            uuid,
  has_password       boolean,
  is_email_confirmed boolean,
  needs_onboarding   boolean,
  username           text
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
    v_uid                                                                       AS user_id,
    (au.encrypted_password IS NOT NULL AND au.encrypted_password <> '')::boolean AS has_password,
    (au.email_confirmed_at IS NOT NULL)::boolean                                 AS is_email_confirmed,
    NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid)              AS needs_onboarding,
    (SELECT p.username FROM public.profiles p WHERE p.id = v_uid)                AS username
    FROM auth.users au
   WHERE au.id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_auth_state() TO anon, authenticated;

-- Sanity: make sure anon users cannot see other people's encrypted_password
-- via some other path. This RPC is scoped to auth.uid() and returns no rows
-- when uid is null.
