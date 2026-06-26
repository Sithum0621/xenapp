-- Member totals for a single institute (superadmin dashboard).

CREATE OR REPLACE FUNCTION public.superadmin_institute_member_counts(p_institute_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admins int;
  v_teachers int;
  v_students int;
BEGIN
  PERFORM public.superadmin_assert();

  IF p_institute_id IS NULL THEN
    RAISE EXCEPTION 'institute_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = p_institute_id) THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;

  SELECT count(*)::int
  INTO v_admins
  FROM public.profiles p
  WHERE p.institute_id = p_institute_id
    AND p.role = 'admin'::public.profile_role_v2;

  SELECT count(*)::int
  INTO v_teachers
  FROM public.institute_teacher_membership m
  INNER JOIN public.profiles p ON p.id = m.user_id
  WHERE m.institute_id = p_institute_id
    AND p.role = 'teacher'::public.profile_role_v2;

  SELECT count(*)::int
  INTO v_students
  FROM public.institute_student_membership m
  INNER JOIN public.profiles p ON p.id = m.user_id
  WHERE m.institute_id = p_institute_id
    AND p.role = 'parent_student'::public.profile_role_v2;

  RETURN jsonb_build_object(
    'admins', coalesce(v_admins, 0),
    'teachers', coalesce(v_teachers, 0),
    'students', coalesce(v_students, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_institute_member_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_institute_member_counts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
