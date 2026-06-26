-- When evaluating profiles roster policies, Postgres scans lecture_groups / teacher_personal_groups.
-- Their RLS previously used EXISTS (SELECT FROM profiles ...), which re-entered profiles RLS and
-- caused infinite recursion / PostgREST 500. Use auth_uid_is_teacher() (SECURITY DEFINER) instead.

DROP POLICY IF EXISTS "teacher_personal_groups_select_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_select_own"
  ON public.teacher_personal_groups
  FOR SELECT
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  );

DROP POLICY IF EXISTS "teacher_personal_groups_insert_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_insert_own"
  ON public.teacher_personal_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  );

DROP POLICY IF EXISTS "teacher_personal_groups_update_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_update_own"
  ON public.teacher_personal_groups
  FOR UPDATE
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  )
  WITH CHECK (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  );

DROP POLICY IF EXISTS "teacher_personal_groups_delete_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_delete_own"
  ON public.teacher_personal_groups
  FOR DELETE
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  );

DROP POLICY IF EXISTS "lecture_group_teachers_select_own_for_teacher" ON public.lecture_group_teachers;
CREATE POLICY "lecture_group_teachers_select_own_for_teacher"
  ON public.lecture_group_teachers
  FOR SELECT
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND public.auth_uid_is_teacher()
  );

DROP POLICY IF EXISTS "lecture_groups_select_for_assigned_teacher" ON public.lecture_groups;
CREATE POLICY "lecture_groups_select_for_assigned_teacher"
  ON public.lecture_groups
  FOR SELECT
  TO authenticated
  USING (
    public.auth_uid_is_teacher()
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

NOTIFY pgrst, 'reload schema';
