-- Normalized teacher workspace: roster (personal groups), attendance, payments, MCQ;
-- extends group_schedules for teacher-owned personal groups.
-- Institute lecture_groups remain authoritative for institute enrollment (read-only to teachers).

-- ---------------------------------------------------------------------------
-- Helper predicates for RLS (SECURITY INVOKER: evaluated as the signed-in user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_can_access_lecture_group(p_lecture_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  )
  AND EXISTS (
    SELECT 1
    FROM public.lecture_groups lg
    WHERE lg.id = p_lecture_group_id
      AND (
        lg.primary_teacher_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.lecture_group_teachers t
          WHERE t.lecture_group_id = lg.id
            AND t.teacher_user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_owns_personal_group(p_personal_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_personal_groups g
    INNER JOIN public.profiles p ON p.id = auth.uid()
    WHERE g.id = p_personal_group_id
      AND g.teacher_user_id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_can_access_lecture_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_lecture_group(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_owns_personal_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_owns_personal_group(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Personal group roster (display-name students; institute roster stays on lecture_group_students)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_personal_roster_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_personal_group_id uuid NOT NULL REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_personal_roster_display_nonempty CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS teacher_personal_roster_group_idx
  ON public.teacher_personal_roster_entries (teacher_personal_group_id);

COMMENT ON TABLE public.teacher_personal_roster_entries IS
  'Students listed under a teacher_personal_group; managed by the owning teacher.';

ALTER TABLE public.teacher_personal_roster_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_personal_roster_select_own
  ON public.teacher_personal_roster_entries
  FOR SELECT
  TO authenticated
  USING (public.teacher_owns_personal_group(teacher_personal_group_id));

CREATE POLICY teacher_personal_roster_insert_own
  ON public.teacher_personal_roster_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.teacher_owns_personal_group(teacher_personal_group_id));

CREATE POLICY teacher_personal_roster_update_own
  ON public.teacher_personal_roster_entries
  FOR UPDATE
  TO authenticated
  USING (public.teacher_owns_personal_group(teacher_personal_group_id))
  WITH CHECK (public.teacher_owns_personal_group(teacher_personal_group_id));

CREATE POLICY teacher_personal_roster_delete_own
  ON public.teacher_personal_roster_entries
  FOR DELETE
  TO authenticated
  USING (public.teacher_owns_personal_group(teacher_personal_group_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_personal_roster_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- Attendance: one session per group per calendar day; marks per student row
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.group_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_group_id uuid REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  teacher_personal_group_id uuid REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE,
  session_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gas_group_xor CHECK (
    (lecture_group_id IS NOT NULL AND teacher_personal_group_id IS NULL)
    OR (lecture_group_id IS NULL AND teacher_personal_group_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS gas_lecture_day_unique
  ON public.group_attendance_sessions (lecture_group_id, session_date)
  WHERE lecture_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gas_personal_day_unique
  ON public.group_attendance_sessions (teacher_personal_group_id, session_date)
  WHERE teacher_personal_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gas_lecture_group_idx ON public.group_attendance_sessions (lecture_group_id);
CREATE INDEX IF NOT EXISTS gas_personal_group_idx ON public.group_attendance_sessions (teacher_personal_group_id);

COMMENT ON TABLE public.group_attendance_sessions IS
  'Daily attendance session for a lecture group or a teacher personal group.';

ALTER TABLE public.group_attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gas_select_teacher
  ON public.group_attendance_sessions
  FOR SELECT
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gas_insert_teacher
  ON public.group_attendance_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gas_update_teacher
  ON public.group_attendance_sessions
  FOR UPDATE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  )
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gas_delete_teacher
  ON public.group_attendance_sessions
  FOR DELETE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_attendance_sessions TO authenticated;

CREATE TABLE IF NOT EXISTS public.group_attendance_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.group_attendance_sessions (id) ON DELETE CASCADE,
  student_user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  personal_roster_id uuid REFERENCES public.teacher_personal_roster_entries (id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gam_student_xor CHECK (
    (student_user_id IS NOT NULL AND personal_roster_id IS NULL)
    OR (student_user_id IS NULL AND personal_roster_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS gam_session_profile_unique
  ON public.group_attendance_marks (session_id, student_user_id)
  WHERE student_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gam_session_roster_unique
  ON public.group_attendance_marks (session_id, personal_roster_id)
  WHERE personal_roster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gam_session_idx ON public.group_attendance_marks (session_id);

COMMENT ON TABLE public.group_attendance_marks IS
  'Presence for one student in a session: institute profile or personal roster entry.';

ALTER TABLE public.group_attendance_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY gam_select_teacher
  ON public.group_attendance_marks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_attendance_sessions s
      WHERE s.id = group_attendance_marks.session_id
        AND (
          (s.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(s.lecture_group_id))
          OR (
            s.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(s.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY gam_insert_teacher
  ON public.group_attendance_marks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.group_attendance_sessions s
      WHERE s.id = group_attendance_marks.session_id
        AND (
          (s.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(s.lecture_group_id))
          OR (
            s.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(s.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY gam_update_teacher
  ON public.group_attendance_marks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_attendance_sessions s
      WHERE s.id = group_attendance_marks.session_id
        AND (
          (s.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(s.lecture_group_id))
          OR (
            s.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(s.teacher_personal_group_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.group_attendance_sessions s
      WHERE s.id = group_attendance_marks.session_id
        AND (
          (s.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(s.lecture_group_id))
          OR (
            s.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(s.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY gam_delete_teacher
  ON public.group_attendance_marks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_attendance_sessions s
      WHERE s.id = group_attendance_marks.session_id
        AND (
          (s.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(s.lecture_group_id))
          OR (
            s.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(s.teacher_personal_group_id)
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_attendance_marks TO authenticated;

-- ---------------------------------------------------------------------------
-- Payments (monthly fee lines per student)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'group_payment_status') THEN
    CREATE TYPE public.group_payment_status AS ENUM ('pending', 'collected');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.group_payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_group_id uuid REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  teacher_personal_group_id uuid REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE,
  student_user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  personal_roster_id uuid REFERENCES public.teacher_personal_roster_entries (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  billing_month date NOT NULL,
  status public.group_payment_status NOT NULL DEFAULT 'pending'::public.group_payment_status,
  collected_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpr_group_xor CHECK (
    (lecture_group_id IS NOT NULL AND teacher_personal_group_id IS NULL)
    OR (lecture_group_id IS NULL AND teacher_personal_group_id IS NOT NULL)
  ),
  CONSTRAINT gpr_student_xor CHECK (
    (student_user_id IS NOT NULL AND personal_roster_id IS NULL)
    OR (student_user_id IS NULL AND personal_roster_id IS NOT NULL)
  ),
  CONSTRAINT gpr_collected_at_ck CHECK (
    (status = 'collected'::public.group_payment_status AND collected_at IS NOT NULL)
    OR (status = 'pending'::public.group_payment_status AND collected_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS gpr_lecture_month_idx
  ON public.group_payment_records (lecture_group_id, billing_month);

CREATE INDEX IF NOT EXISTS gpr_personal_month_idx
  ON public.group_payment_records (teacher_personal_group_id, billing_month);

COMMENT ON TABLE public.group_payment_records IS
  'Fee line per student per billing month; amounts in cents; normalized by group and student reference.';

ALTER TABLE public.group_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY gpr_select_teacher
  ON public.group_payment_records
  FOR SELECT
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gpr_insert_teacher
  ON public.group_payment_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gpr_update_teacher
  ON public.group_payment_records
  FOR UPDATE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  )
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY gpr_delete_teacher
  ON public.group_payment_records
  FOR DELETE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_payment_records TO authenticated;

-- ---------------------------------------------------------------------------
-- Extend group_schedules for teacher personal groups (XOR with lecture_group_id)
-- ---------------------------------------------------------------------------

ALTER TABLE public.group_schedules
  ALTER COLUMN lecture_group_id DROP NOT NULL;

ALTER TABLE public.group_schedules
  ADD COLUMN IF NOT EXISTS teacher_personal_group_id uuid REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE;

ALTER TABLE public.group_schedules
  DROP CONSTRAINT IF EXISTS group_schedules_group_target_ck;

ALTER TABLE public.group_schedules
  ADD CONSTRAINT group_schedules_group_target_ck CHECK (
    (lecture_group_id IS NOT NULL AND teacher_personal_group_id IS NULL)
    OR (lecture_group_id IS NULL AND teacher_personal_group_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS group_schedules_personal_group_id_idx
  ON public.group_schedules (teacher_personal_group_id);

COMMENT ON TABLE public.group_schedules IS
  'Class times: recurring_weekly (day_of_week + times) or one_time (class_date + times); lecture_group_id OR teacher_personal_group_id.';

DROP POLICY IF EXISTS group_schedules_teacher_select ON public.group_schedules;
CREATE POLICY group_schedules_teacher_select
  ON public.group_schedules
  FOR SELECT
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (
      teacher_personal_group_id IS NOT NULL
      AND public.teacher_owns_personal_group(teacher_personal_group_id)
    )
  );

DROP POLICY IF EXISTS group_schedules_teacher_insert ON public.group_schedules;
CREATE POLICY group_schedules_teacher_insert
  ON public.group_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (
      teacher_personal_group_id IS NOT NULL
      AND public.teacher_owns_personal_group(teacher_personal_group_id)
    )
  );

DROP POLICY IF EXISTS group_schedules_teacher_update ON public.group_schedules;
CREATE POLICY group_schedules_teacher_update
  ON public.group_schedules
  FOR UPDATE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (
      teacher_personal_group_id IS NOT NULL
      AND public.teacher_owns_personal_group(teacher_personal_group_id)
    )
  )
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (
      teacher_personal_group_id IS NOT NULL
      AND public.teacher_owns_personal_group(teacher_personal_group_id)
    )
  );

DROP POLICY IF EXISTS group_schedules_teacher_delete ON public.group_schedules;
CREATE POLICY group_schedules_teacher_delete
  ON public.group_schedules
  FOR DELETE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (
      teacher_personal_group_id IS NOT NULL
      AND public.teacher_owns_personal_group(teacher_personal_group_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_schedules TO authenticated;

-- ---------------------------------------------------------------------------
-- MCQ: question + option rows; exactly one option marked correct per question
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_group_mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_group_id uuid REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  teacher_personal_group_id uuid REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE,
  prompt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tgmq_group_xor CHECK (
    (lecture_group_id IS NOT NULL AND teacher_personal_group_id IS NULL)
    OR (lecture_group_id IS NULL AND teacher_personal_group_id IS NOT NULL)
  ),
  CONSTRAINT tgmq_prompt_nonempty CHECK (length(trim(prompt)) > 0)
);

CREATE INDEX IF NOT EXISTS tgmq_lecture_idx ON public.teacher_group_mcq_questions (lecture_group_id);
CREATE INDEX IF NOT EXISTS tgmq_personal_idx ON public.teacher_group_mcq_questions (teacher_personal_group_id);

COMMENT ON TABLE public.teacher_group_mcq_questions IS
  'Teacher-authored MCQ stem per group; answers in teacher_group_mcq_options (is_correct hidden from student-facing APIs).';

ALTER TABLE public.teacher_group_mcq_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tgmq_select_teacher
  ON public.teacher_group_mcq_questions
  FOR SELECT
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY tgmq_insert_teacher
  ON public.teacher_group_mcq_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY tgmq_update_teacher
  ON public.teacher_group_mcq_questions
  FOR UPDATE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  )
  WITH CHECK (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

CREATE POLICY tgmq_delete_teacher
  ON public.teacher_group_mcq_questions
  FOR DELETE
  TO authenticated
  USING (
    (lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(lecture_group_id))
    OR (teacher_personal_group_id IS NOT NULL AND public.teacher_owns_personal_group(teacher_personal_group_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_group_mcq_questions TO authenticated;

CREATE TABLE IF NOT EXISTS public.teacher_group_mcq_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.teacher_group_mcq_questions (id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal >= 1 AND ordinal <= 4),
  body text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  CONSTRAINT tgmqo_body_nonempty CHECK (length(trim(body)) > 0),
  CONSTRAINT tgmqo_question_ordinal_unique UNIQUE (question_id, ordinal)
);

CREATE UNIQUE INDEX IF NOT EXISTS tgmqo_one_correct_per_question
  ON public.teacher_group_mcq_options (question_id)
  WHERE is_correct;

CREATE INDEX IF NOT EXISTS tgmqo_question_idx ON public.teacher_group_mcq_options (question_id);

COMMENT ON TABLE public.teacher_group_mcq_options IS
  'Four options per question; partial unique index enforces a single is_correct row per question.';

ALTER TABLE public.teacher_group_mcq_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY tgmqo_select_teacher
  ON public.teacher_group_mcq_options
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teacher_group_mcq_questions q
      WHERE q.id = teacher_group_mcq_options.question_id
        AND (
          (q.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(q.lecture_group_id))
          OR (
            q.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(q.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY tgmqo_insert_teacher
  ON public.teacher_group_mcq_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.teacher_group_mcq_questions q
      WHERE q.id = teacher_group_mcq_options.question_id
        AND (
          (q.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(q.lecture_group_id))
          OR (
            q.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(q.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY tgmqo_update_teacher
  ON public.teacher_group_mcq_options
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teacher_group_mcq_questions q
      WHERE q.id = teacher_group_mcq_options.question_id
        AND (
          (q.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(q.lecture_group_id))
          OR (
            q.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(q.teacher_personal_group_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.teacher_group_mcq_questions q
      WHERE q.id = teacher_group_mcq_options.question_id
        AND (
          (q.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(q.lecture_group_id))
          OR (
            q.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(q.teacher_personal_group_id)
          )
        )
    )
  );

CREATE POLICY tgmqo_delete_teacher
  ON public.teacher_group_mcq_options
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teacher_group_mcq_questions q
      WHERE q.id = teacher_group_mcq_options.question_id
        AND (
          (q.lecture_group_id IS NOT NULL AND public.teacher_can_access_lecture_group(q.lecture_group_id))
          OR (
            q.teacher_personal_group_id IS NOT NULL
            AND public.teacher_owns_personal_group(q.teacher_personal_group_id)
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_group_mcq_options TO authenticated;

-- ---------------------------------------------------------------------------
-- Teachers can read institute enrollment for assigned lecture groups
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lecture_group_students_select_assigned_teacher ON public.lecture_group_students;
CREATE POLICY lecture_group_students_select_assigned_teacher
  ON public.lecture_group_students
  FOR SELECT
  TO authenticated
  USING (public.teacher_can_access_lecture_group(lecture_group_id));

-- Teachers may read minimal profile rows for students on their lecture group rosters (names).
DROP POLICY IF EXISTS profiles_select_roster_student_for_teacher ON public.profiles;
CREATE POLICY profiles_select_roster_student_for_teacher
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lecture_group_students lgs
      WHERE lgs.student_user_id = profiles.id
        AND public.teacher_can_access_lecture_group(lgs.lecture_group_id)
    )
  );

NOTIFY pgrst, 'reload schema';
