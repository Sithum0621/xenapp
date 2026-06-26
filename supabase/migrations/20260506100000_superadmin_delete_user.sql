-- Allow platform superadmins to remove accounts (auth.users CASCADE cleans profiles/subscriptions/MFA rows).

CREATE OR REPLACE FUNCTION public.superadmin_delete_user(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_target_user_id
      AND p.role = 'superadmin'::profile_role_v2
  ) THEN
    RAISE EXCEPTION 'cannot_delete_superadmin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_target_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  DELETE FROM auth.users WHERE id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_user(uuid) TO authenticated;
