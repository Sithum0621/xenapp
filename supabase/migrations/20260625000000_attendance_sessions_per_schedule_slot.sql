-- Tie attendance sessions to a specific schedule slot (weekly or extra class) so each can be marked separately.

ALTER TABLE public.group_attendance_sessions
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.group_schedules (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gas_schedule_id_idx
  ON public.group_attendance_sessions (schedule_id)
  WHERE schedule_id IS NOT NULL;

DROP INDEX IF EXISTS public.gas_lecture_day_unique;
DROP INDEX IF EXISTS public.gas_personal_day_unique;

CREATE UNIQUE INDEX IF NOT EXISTS gas_lecture_schedule_day_unique
  ON public.group_attendance_sessions (lecture_group_id, session_date, schedule_id)
  WHERE lecture_group_id IS NOT NULL AND schedule_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gas_personal_schedule_day_unique
  ON public.group_attendance_sessions (teacher_personal_group_id, session_date, schedule_id)
  WHERE teacher_personal_group_id IS NOT NULL AND schedule_id IS NOT NULL;

COMMENT ON COLUMN public.group_attendance_sessions.schedule_id IS
  'Optional link to group_schedules row (weekly slot or one-time extra). Enables separate attendance per class on the same day.';

-- List scheduled class slots for a calendar day (includes extra / one_time classes).
CREATE OR REPLACE FUNCTION public.teacher_list_attendance_slots_for_date(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute',
  p_session_date date DEFAULT NULL
)
RETURNS TABLE (
  schedule_id   uuid,
  kind          text,
  start_time    text,
  end_time      text,
  session_id    uuid,
  marked_count  int,
  present_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_date date := COALESCE(p_session_date, CURRENT_DATE);
  v_dow  int  := EXTRACT(DOW FROM v_date)::int;
  v_year int  := EXTRACT(YEAR FROM v_date)::int;
  v_src  text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF v_src = 'personal' THEN
    IF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    RETURN QUERY
    SELECT
      gs.id AS schedule_id,
      gs.kind::text AS kind,
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      s.id AS session_id,
      COALESCE(mc.marked_count, 0)::int AS marked_count,
      COALESCE(mc.present_count, 0)::int AS present_count
    FROM public.group_schedules gs
    LEFT JOIN public.group_attendance_sessions s
      ON s.teacher_personal_group_id = p_group_id
     AND s.session_date = v_date
     AND s.schedule_id = gs.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS marked_count,
        COUNT(*) FILTER (WHERE m.present)::int AS present_count
      FROM public.group_attendance_marks m
      WHERE m.session_id = s.id
    ) mc ON true
    WHERE gs.teacher_personal_group_id = p_group_id
      AND (
        (
          gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow
        )
        OR (
          gs.kind = 'one_time'::public.group_schedule_kind
          AND gs.class_date = v_date
        )
      )
    ORDER BY gs.start_time;
  ELSE
    IF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    RETURN QUERY
    SELECT
      gs.id AS schedule_id,
      gs.kind::text AS kind,
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      s.id AS session_id,
      COALESCE(mc.marked_count, 0)::int AS marked_count,
      COALESCE(mc.present_count, 0)::int AS present_count
    FROM public.group_schedules gs
    LEFT JOIN public.group_attendance_sessions s
      ON s.lecture_group_id = p_group_id
     AND s.session_date = v_date
     AND s.schedule_id = gs.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS marked_count,
        COUNT(*) FILTER (WHERE m.present)::int AS present_count
      FROM public.group_attendance_marks m
      WHERE m.session_id = s.id
    ) mc ON true
    WHERE gs.lecture_group_id = p_group_id
      AND (
        (
          gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow
        )
        OR (
          gs.kind = 'one_time'::public.group_schedule_kind
          AND gs.class_date = v_date
        )
      )
    ORDER BY gs.start_time;
  END IF;
END;
$$;

-- Save attendance for one schedule slot on a date (creates session + marks).
CREATE OR REPLACE FUNCTION public.teacher_save_attendance_for_slot(
  p_group_id      uuid,
  p_schedule_id   uuid,
  p_group_source  text DEFAULT 'institute',
  p_session_date  date DEFAULT NULL,
  p_marks         jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_date      date := COALESCE(p_session_date, CURRENT_DATE);
  v_src       text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_session   uuid;
  v_mark      jsonb;
  v_sid       uuid;
  v_present   boolean;
  v_student   uuid;
  v_roster    uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_schedule_id IS NULL THEN RAISE EXCEPTION 'schedule_id_required'; END IF;

  IF v_src = 'personal' THEN
    IF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.group_schedules gs
      WHERE gs.id = p_schedule_id AND gs.teacher_personal_group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'schedule_not_in_group';
    END IF;

    INSERT INTO public.group_attendance_sessions (
      teacher_personal_group_id,
      session_date,
      schedule_id
    )
    VALUES (p_group_id, v_date, p_schedule_id)
    ON CONFLICT (teacher_personal_group_id, session_date, schedule_id)
      WHERE teacher_personal_group_id IS NOT NULL AND schedule_id IS NOT NULL
    DO UPDATE SET session_date = EXCLUDED.session_date
    RETURNING id INTO v_session;

    FOR v_mark IN SELECT value FROM jsonb_array_elements(COALESCE(p_marks, '[]'::jsonb))
    LOOP
      v_roster := NULLIF(trim(v_mark->>'personal_roster_id'), '')::uuid;
      v_student := NULLIF(trim(v_mark->>'student_user_id'), '')::uuid;
      v_present := COALESCE((v_mark->>'present')::boolean, false);

      IF v_roster IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.teacher_personal_roster_entries r
          WHERE r.id = v_roster AND r.teacher_personal_group_id = p_group_id
        ) THEN
          CONTINUE;
        END IF;
        INSERT INTO public.group_attendance_marks (session_id, personal_roster_id, present)
        VALUES (v_session, v_roster, v_present)
        ON CONFLICT (session_id, personal_roster_id) WHERE personal_roster_id IS NOT NULL
        DO UPDATE SET present = EXCLUDED.present, recorded_at = now();
      ELSIF v_student IS NOT NULL THEN
        INSERT INTO public.group_attendance_marks (session_id, student_user_id, present)
        VALUES (v_session, v_student, v_present)
        ON CONFLICT (session_id, student_user_id) WHERE student_user_id IS NOT NULL
        DO UPDATE SET present = EXCLUDED.present, recorded_at = now();
      END IF;
    END LOOP;
  ELSE
    IF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.group_schedules gs
      WHERE gs.id = p_schedule_id AND gs.lecture_group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'schedule_not_in_group';
    END IF;

    INSERT INTO public.group_attendance_sessions (
      lecture_group_id,
      session_date,
      schedule_id
    )
    VALUES (p_group_id, v_date, p_schedule_id)
    ON CONFLICT (lecture_group_id, session_date, schedule_id)
      WHERE lecture_group_id IS NOT NULL AND schedule_id IS NOT NULL
    DO UPDATE SET session_date = EXCLUDED.session_date
    RETURNING id INTO v_session;

    FOR v_mark IN SELECT value FROM jsonb_array_elements(COALESCE(p_marks, '[]'::jsonb))
    LOOP
      v_student := NULLIF(trim(v_mark->>'student_user_id'), '')::uuid;
      v_present := COALESCE((v_mark->>'present')::boolean, false);
      IF v_student IS NULL THEN CONTINUE; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.lecture_group_students lgs
        WHERE lgs.lecture_group_id = p_group_id AND lgs.student_user_id = v_student
      ) THEN
        CONTINUE;
      END IF;
      INSERT INTO public.group_attendance_marks (session_id, student_user_id, present)
      VALUES (v_session, v_student, v_present)
      ON CONFLICT (session_id, student_user_id) WHERE student_user_id IS NOT NULL
      DO UPDATE SET present = EXCLUDED.present, recorded_at = now();
    END LOOP;
  END IF;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_list_attendance_slots_for_date(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_list_attendance_slots_for_date(uuid, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_save_attendance_for_slot(uuid, uuid, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_save_attendance_for_slot(uuid, uuid, text, date, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
