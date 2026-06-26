-- Temporary expiring passwords apply only to parent_student accounts (teacher-enrolled students).
-- Teachers and admins self-provision or receive permanent credentials; staff never expire.

UPDATE public.profiles
SET temp_password_expires_at = NULL
WHERE role IN (
  'teacher'::public.profile_role_v2,
  'admin'::public.profile_role_v2,
  'superadmin'::public.profile_role_v2
);

CREATE OR REPLACE FUNCTION public.temp_password_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.profile_role_v2;
  v_expires timestamptz;
  v_created timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('is_temporary', false);
  END IF;

  SELECT p.role, p.temp_password_expires_at, p.password_created_at
    INTO v_role, v_expires, v_created
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT FOUND OR v_role IS DISTINCT FROM 'parent_student'::public.profile_role_v2 THEN
    RETURN jsonb_build_object(
      'is_temporary', false,
      'password_created_at', v_created
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.provision_staff_temp_password(
  p_user_id uuid,
  p_hours int DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.profile_role_v2;
  v_hours int := GREATEST(1, LEAST(COALESCE(p_hours, 3), 168));
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Staff accounts never use expiring temporary passwords.
  IF v_role IN (
    'teacher'::public.profile_role_v2,
    'admin'::public.profile_role_v2,
    'superadmin'::public.profile_role_v2
  ) THEN
    UPDATE public.profiles
    SET temp_password_expires_at = NULL
    WHERE id = p_user_id;
    RETURN;
  END IF;

  IF v_role IS DISTINCT FROM 'parent_student'::public.profile_role_v2 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    password_created_at = COALESCE(password_created_at, now()),
    temp_password_expires_at = now() + make_interval(hours => v_hours)
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.provision_staff_temp_password(uuid, int) IS
  'Sets temp_password_expires_at for parent_student only. Clears expiry for staff roles.';

NOTIFY pgrst, 'reload schema';
