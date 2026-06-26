-- Platform-wide counts for the superadmin dashboard home.

CREATE OR REPLACE FUNCTION public.superadmin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  RETURN jsonb_build_object(
    'teachers', (
      SELECT count(*)::bigint
      FROM public.profiles
      WHERE role = 'teacher'::public.profile_role_v2
    ),
    'admins', (
      SELECT count(*)::bigint
      FROM public.profiles
      WHERE role = 'admin'::public.profile_role_v2
    ),
    'students', (
      SELECT count(*)::bigint
      FROM public.profiles
      WHERE role = 'parent_student'::public.profile_role_v2
    ),
    'institutes', (
      SELECT count(*)::bigint
      FROM public.institutes
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_dashboard_stats() TO authenticated;
