-- 3-hour temporary passwords for staff (admin / teacher) provisioned by edge functions.

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
  v_hours int;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  v_hours := greatest(coalesce(p_hours, 3), 1);

  UPDATE public.profiles
  SET
    password_created_at = now(),
    temp_password_expires_at = now() + make_interval(hours => v_hours)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_staff_temp_password(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_staff_temp_password(uuid, int) TO service_role;

COMMENT ON FUNCTION public.provision_staff_temp_password(uuid, int) IS
  'Marks a profile as using a temporary password that expires after p_hours (default 3). Cleared by confirm_password_reset.';

NOTIFY pgrst, 'reload schema';
