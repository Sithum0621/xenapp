-- Targeted hardening pass:
--   (1) Audit columns for accountability (updated_at on payments, created_by on attendance sessions).
--   (2) Tightest RLS for the "Add Student" path: only the assigned teacher of a lecture_group can
--       INSERT / UPDATE / DELETE rows in public.lecture_group_students directly. The edge function
--       uses service_role and bypasses RLS, but this gives defense-in-depth for any direct write.
--   (3) Reaffirm SELECT scope on lecture_group_students (was added earlier; idempotent here).
--   (4) Sanity GRANTs (idempotent).
--
-- Stats (group_attendance_sessions, group_attendance_marks) and Payments (group_payment_records)
-- already have tight teacher-only USING/WITH CHECK policies bound to
-- public.teacher_can_access_lecture_group() OR public.teacher_owns_personal_group(). No change.

-- ---------------------------------------------------------------------------
-- (1) Audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.group_payment_records
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.group_payment_records_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_payment_records_updated_at ON public.group_payment_records;
CREATE TRIGGER group_payment_records_updated_at
BEFORE UPDATE ON public.group_payment_records
FOR EACH ROW
EXECUTE FUNCTION public.group_payment_records_set_updated_at();

ALTER TABLE public.group_attendance_sessions
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS group_attendance_sessions_created_by_idx
  ON public.group_attendance_sessions (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

-- Auto-stamp created_by_user_id on insert so callers don't have to.
CREATE OR REPLACE FUNCTION public.group_attendance_sessions_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_attendance_sessions_set_created_by_trg ON public.group_attendance_sessions;
CREATE TRIGGER group_attendance_sessions_set_created_by_trg
BEFORE INSERT ON public.group_attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION public.group_attendance_sessions_set_created_by();

-- ---------------------------------------------------------------------------
-- (2) Tight client RLS on lecture_group_students: assigned teacher only
--
--     Defense-in-depth helper. teacher_can_access_lecture_group() is SECURITY DEFINER and verifies
--     auth.uid() is either primary_teacher_user_id on the group OR present in lecture_group_teachers.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lecture_group_students_select_assigned_teacher ON public.lecture_group_students;
CREATE POLICY lecture_group_students_select_assigned_teacher
  ON public.lecture_group_students
  FOR SELECT
  TO authenticated
  USING (public.teacher_can_access_lecture_group(lecture_group_id));

DROP POLICY IF EXISTS lecture_group_students_insert_assigned_teacher ON public.lecture_group_students;
CREATE POLICY lecture_group_students_insert_assigned_teacher
  ON public.lecture_group_students
  FOR INSERT
  TO authenticated
  WITH CHECK (public.teacher_can_access_lecture_group(lecture_group_id));

DROP POLICY IF EXISTS lecture_group_students_update_assigned_teacher ON public.lecture_group_students;
CREATE POLICY lecture_group_students_update_assigned_teacher
  ON public.lecture_group_students
  FOR UPDATE
  TO authenticated
  USING (public.teacher_can_access_lecture_group(lecture_group_id))
  WITH CHECK (public.teacher_can_access_lecture_group(lecture_group_id));

DROP POLICY IF EXISTS lecture_group_students_delete_assigned_teacher ON public.lecture_group_students;
CREATE POLICY lecture_group_students_delete_assigned_teacher
  ON public.lecture_group_students
  FOR DELETE
  TO authenticated
  USING (public.teacher_can_access_lecture_group(lecture_group_id));

-- Also let an assigned teacher read minimal profile rows for students they just enrolled even
-- before the next page load (already covered by profiles_select_roster_student_for_teacher).
-- Keeping a single profiles RLS path (no duplicate policy) — handled in 20260531110000.

-- ---------------------------------------------------------------------------
-- (3) Idempotent GRANTs (the May 2026 explicit-grants sweep already covered these)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_group_students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_attendance_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_payment_records TO authenticated;

NOTIFY pgrst, 'reload schema';
