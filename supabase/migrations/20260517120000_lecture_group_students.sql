-- Enrollment of institute students in lecture groups (many-to-many).

CREATE TABLE IF NOT EXISTS public.lecture_group_students (
  lecture_group_id uuid NOT NULL REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lecture_group_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS lecture_group_students_student_idx
  ON public.lecture_group_students (student_user_id);

COMMENT ON TABLE public.lecture_group_students IS
  'Students enrolled in a lecture group; scoped via institute_admin_* RPCs only.';

ALTER TABLE public.lecture_group_students ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.institute_admin_list_lecture_group_students(p_lecture_group_id uuid)
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
  v_inst uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  IF NOT EXISTS (
    SELECT 1
    FROM public.lecture_groups g
    WHERE g.id = p_lecture_group_id
      AND g.institute_id = v_inst
  ) THEN
    RAISE EXCEPTION 'lecture_group_not_in_institute';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.lecture_group_students lgs
  INNER JOIN public.profiles p ON p.id = lgs.student_user_id
  INNER JOIN auth.users u ON u.id = p.id
  WHERE lgs.lecture_group_id = p_lecture_group_id
    AND p.role = 'parent_student'::public.profile_role_v2
  ORDER BY lower(COALESCE(NULLIF(trim(p.full_name), ''), u.email::text));
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_lecture_group_students(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_lecture_group_students(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
