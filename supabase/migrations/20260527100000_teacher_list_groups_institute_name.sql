-- Include institute id + name with teacher lecture group listings (Classes UI tags).

DROP FUNCTION IF EXISTS public.teacher_list_my_lecture_groups();

CREATE OR REPLACE FUNCTION public.teacher_list_my_lecture_groups()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  is_primary boolean,
  institute_id uuid,
  institute_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.name::text,
    g.description::text,
    g.created_at,
    (g.primary_teacher_user_id = v_uid)::boolean,
    g.institute_id,
    i.name::text
  FROM public.lecture_groups g
  INNER JOIN public.institutes i ON i.id = g.institute_id
  LEFT JOIN public.lecture_group_teachers gt
    ON gt.lecture_group_id = g.id
    AND gt.teacher_user_id = v_uid
  WHERE g.primary_teacher_user_id = v_uid
    OR gt.teacher_user_id IS NOT NULL
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_list_my_lecture_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_list_my_lecture_groups() TO authenticated;

NOTIFY pgrst, 'reload schema';
