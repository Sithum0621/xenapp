-- Superadmin: list teachers and students linked to an institute.

CREATE OR REPLACE FUNCTION public.superadmin_list_institute_profiles(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  profile_role text,
  xen_student_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute uuid;
  v_search text;
  v_limit int := 100;
  v_offset int := 0;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_institute := trim(coalesce(p_filters->>'institute_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'institute_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute) THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;

  v_search := lower(trim(coalesce(p_filters->>'search', '')));

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
  SELECT *
  FROM (
    SELECT
      p.id AS user_id,
      u.email::text AS email,
      COALESCE(p.full_name, '')::text AS full_name,
      'teacher'::text AS profile_role,
      NULL::text AS xen_student_id
    FROM public.institute_teacher_membership m
    INNER JOIN public.profiles p ON p.id = m.user_id
    INNER JOIN auth.users u ON u.id = p.id
    WHERE m.institute_id = v_institute
      AND p.role = 'teacher'::public.profile_role_v2

    UNION ALL

    SELECT
      p.id AS user_id,
      u.email::text AS email,
      COALESCE(p.full_name, '')::text AS full_name,
      'parent_student'::text AS profile_role,
      NULLIF(trim(COALESCE(p.xen_student_id, '')), '')::text AS xen_student_id
    FROM public.institute_student_membership m
    INNER JOIN public.profiles p ON p.id = m.user_id
    INNER JOIN auth.users u ON u.id = p.id
    WHERE m.institute_id = v_institute
      AND p.role = 'parent_student'::public.profile_role_v2
  ) combined
  WHERE (
    length(v_search) = 0
    OR lower(combined.full_name) LIKE '%' || v_search || '%'
    OR lower(combined.email) LIKE '%' || v_search || '%'
    OR lower(coalesce(combined.xen_student_id, '')) LIKE '%' || v_search || '%'
  )
  ORDER BY
    CASE combined.profile_role WHEN 'teacher' THEN 0 ELSE 1 END,
    lower(combined.full_name),
    lower(combined.email)
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institute_profiles(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institute_profiles(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
