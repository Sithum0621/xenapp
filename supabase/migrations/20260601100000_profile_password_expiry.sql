-- Track when a profile's password was set and (for teacher-invited temp passwords) when it expires.
-- Used to enforce a 24-hour temporary-password lifetime for students enrolled by a teacher.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_created_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS temp_password_expires_at timestamptz;

COMMENT ON COLUMN public.profiles.password_created_at IS
  'When the current password was set. Updated by clients after a successful supabase.auth.updateUser({ password }).';

COMMENT ON COLUMN public.profiles.temp_password_expires_at IS
  'For teacher-invited students: timestamp when the temporary password expires. NULL once the student has chosen their own password.';

-- Backfill existing rows so `password_created_at` is never NULL for established accounts.
UPDATE public.profiles p
SET password_created_at = COALESCE(u.email_confirmed_at, u.phone_confirmed_at, u.created_at, now())
FROM auth.users u
WHERE u.id = p.id
  AND p.password_created_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_temp_password_expires_idx
  ON public.profiles (temp_password_expires_at)
  WHERE temp_password_expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPC: read temp password status for the currently authenticated user.
-- Returns is_temporary, is_expired, expires_at, password_created_at.
-- Bypasses RLS via SECURITY DEFINER so the client can ask immediately after sign-in.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.temp_password_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_expires timestamptz;
  v_created timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_temporary', false);
  END IF;

  SELECT temp_password_expires_at, password_created_at
    INTO v_expires, v_created
    FROM public.profiles
   WHERE id = v_uid;

  IF v_expires IS NULL THEN
    RETURN jsonb_build_object(
      'is_temporary', false,
      'password_created_at', v_created
    );
  END IF;

  RETURN jsonb_build_object(
    'is_temporary', true,
    'expires_at', v_expires,
    'is_expired', v_expires <= now(),
    'password_created_at', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.temp_password_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.temp_password_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: called by clients right after supabase.auth.updateUser({ password }).
-- Clears the temp expiry and refreshes password_created_at to "now".
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_password_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
     SET temp_password_expires_at = NULL,
         password_created_at = now()
   WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_password_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_password_reset() TO authenticated;

NOTIFY pgrst, 'reload schema';
