-- App lock: optional PIN stored hashed (bcrypt) per profile user_id; RPC-only access.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.profile_app_lock (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  pin_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profile_app_lock IS
  'PIN hash and enable flag for app lock; accessed only via app_lock_* SECURITY DEFINER RPCs.';

ALTER TABLE public.profile_app_lock ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profile_app_lock FROM PUBLIC;
REVOKE ALL ON public.profile_app_lock FROM anon;
REVOKE ALL ON public.profile_app_lock FROM authenticated;

CREATE OR REPLACE FUNCTION public.app_lock_ensure_row(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_app_lock (user_id, enabled)
  VALUES (p_uid, false)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_ensure_row(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.app_lock_get_status()
RETURNS TABLE (enabled boolean, pin_is_set boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(l.enabled, false),
    (l.pin_hash IS NOT NULL AND length(trim(COALESCE(l.pin_hash, ''))) > 0)
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.profile_app_lock l ON l.user_id = u.uid;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_get_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_get_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.app_lock_set_enabled(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public.app_lock_ensure_row(v_uid);

  SELECT pin_hash INTO v_hash FROM public.profile_app_lock WHERE user_id = v_uid;

  IF p_enabled AND (v_hash IS NULL OR length(trim(v_hash)) = 0) THEN
    RAISE EXCEPTION 'pin_required_before_enable';
  END IF;

  UPDATE public.profile_app_lock
  SET enabled = p_enabled, updated_at = now()
  WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_set_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_set_enabled(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.app_lock_set_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean text;
  v_existing text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_clean := trim(coalesce(p_pin, ''));
  IF v_clean !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;

  PERFORM public.app_lock_ensure_row(v_uid);

  SELECT pin_hash INTO v_existing FROM public.profile_app_lock WHERE user_id = v_uid FOR UPDATE;

  IF v_existing IS NOT NULL AND length(trim(v_existing)) > 0 THEN
    RAISE EXCEPTION 'pin_already_set';
  END IF;

  UPDATE public.profile_app_lock
  SET pin_hash = crypt(v_clean, gen_salt('bf')), updated_at = now()
  WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_set_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_set_pin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.app_lock_change_pin(p_current_pin text, p_new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur text := trim(coalesce(p_current_pin, ''));
  v_new text := trim(coalesce(p_new_pin, ''));
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_cur !~ '^[0-9]{4}$' OR v_new !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;

  UPDATE public.profile_app_lock
  SET
    pin_hash = crypt(v_new, gen_salt('bf')),
    updated_at = now()
  WHERE user_id = v_uid
    AND pin_hash IS NOT NULL
    AND crypt(v_cur, pin_hash) = pin_hash;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'wrong_current_pin';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_change_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_change_pin(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.app_lock_verify_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean text;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  v_clean := trim(coalesce(p_pin, ''));

  SELECT pin_hash INTO v_hash FROM public.profile_app_lock WHERE user_id = v_uid;

  IF v_hash IS NULL OR length(trim(v_hash)) = 0 THEN
    RETURN false;
  END IF;

  IF v_clean !~ '^[0-9]{4}$' THEN
    RETURN false;
  END IF;

  RETURN crypt(v_clean, v_hash) = v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lock_verify_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_lock_verify_pin(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
