-- Institute admins: list / search / assign teachers within their institute only.

COMMENT ON COLUMN public.profiles.institute_id IS
  'Institute assignment for admins and teachers; admins set via superadmin RPCs; teachers via institute_admin_assign_teacher.';

CREATE OR REPLACE FUNCTION public.institute_admin_require_institute()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institute uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.institute_id INTO v_institute
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.role = 'admin'::public.profile_role_v2;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'not_institute_admin';
  END IF;

  RETURN v_institute;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_require_institute() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_require_institute() TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_list_teachers(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_search text;
  v_limit int := 100;
  v_offset int := 0;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 100), 1), 200);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 100;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.institute_id = v_my_institute
    AND p.role = 'teacher'::public.profile_role_v2
    AND (
      length(v_search) = 0
      OR u.email::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_teachers(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_teachers(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_search_teachers_to_assign(p_query jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_search text;
  v_limit int := 25;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  v_search := trim(coalesce(p_query->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_query->>'limit')::int, 25), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 25;
  END;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'teacher'::public.profile_role_v2
    AND p.institute_id IS NULL
    AND (
      length(v_search) = 0
      OR u.email::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_search_teachers_to_assign(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_search_teachers_to_assign(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_assign_teacher(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_teacher uuid;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  BEGIN
    v_teacher := trim(coalesce(p_payload->>'teacher_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_teacher_id';
  END;

  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_teacher AND role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'cannot_assign_superadmin';
  END IF;

  UPDATE public.profiles
  SET institute_id = v_my_institute
  WHERE id = v_teacher
    AND role = 'teacher'::public.profile_role_v2
    AND institute_id IS NULL;

  IF FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_teacher) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_teacher AND role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  RAISE EXCEPTION 'teacher_already_assigned';
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_assign_teacher(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_assign_teacher(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
