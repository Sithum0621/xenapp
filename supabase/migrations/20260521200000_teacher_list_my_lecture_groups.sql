-- Teachers: list lecture groups they are assigned to (primary and/or co-teacher).

CREATE OR REPLACE FUNCTION public.teacher_list_my_lecture_groups()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  is_primary boolean
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
    (g.primary_teacher_user_id = v_uid)::boolean
  FROM public.lecture_groups g
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
