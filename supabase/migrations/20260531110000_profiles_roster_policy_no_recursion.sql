-- profiles_select_roster_student_for_teacher must not call teacher_can_access_lecture_group() from
-- within an RLS policy ON profiles: that function reads profiles, which re-enters profiles RLS and
-- can yield infinite recursion / 500 from PostgREST even when the helper is SECURITY DEFINER on
-- some deployments. Inline lecture-group membership checks here and gate on auth_uid_is_teacher()
-- only inside SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.auth_uid_is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_is_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_is_teacher() TO authenticated;

DROP POLICY IF EXISTS profiles_select_roster_student_for_teacher ON public.profiles;
CREATE POLICY profiles_select_roster_student_for_teacher
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.auth_uid_is_teacher()
    AND EXISTS (
      SELECT 1
      FROM public.lecture_group_students lgs
      INNER JOIN public.lecture_groups lg ON lg.id = lgs.lecture_group_id
      WHERE lgs.student_user_id = profiles.id
        AND (
          lg.primary_teacher_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.lecture_group_teachers t
            WHERE t.lecture_group_id = lg.id
              AND t.teacher_user_id = auth.uid()
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
