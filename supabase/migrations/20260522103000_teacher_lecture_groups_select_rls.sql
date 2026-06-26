-- Allow teachers to read their own lecture group assignments (fallback when RPC is not yet in schema cache).

DROP POLICY IF EXISTS "lecture_group_teachers_select_own_for_teacher" ON public.lecture_group_teachers;
CREATE POLICY "lecture_group_teachers_select_own_for_teacher"
  ON public.lecture_group_teachers
  FOR SELECT
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS "lecture_groups_select_for_assigned_teacher" ON public.lecture_groups;
CREATE POLICY "lecture_groups_select_for_assigned_teacher"
  ON public.lecture_groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
    AND (
      primary_teacher_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.lecture_group_teachers gt
        WHERE gt.lecture_group_id = lecture_groups.id
          AND gt.teacher_user_id = auth.uid()
      )
    )
  );
