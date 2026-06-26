-- Attendance notifications: student + parent push with child name and exact mark time.
-- Only notify when a student is newly marked present (not duplicates).

DROP FUNCTION IF EXISTS public.teacher_save_attendance_for_slot(uuid, uuid, text, date, jsonb);

CREATE OR REPLACE FUNCTION public.notify_attendance_marked(
  p_student_user_id uuid,
  p_group_id        uuid,
  p_group_source    text,
  p_group_name      text,
  p_schedule_id     uuid,
  p_session_id      uuid,
  p_session_date    date,
  p_class_label     text,
  p_marked_at       time
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name  text;
  v_mark_label    text;
  v_date_label    text;
  v_parent_id     uuid;
  v_count         int := 0;
  v_parent_title  text := 'Attendance recorded';
  v_student_title text := 'Attendance recorded';
  v_parent_body   text;
  v_student_body  text;
  v_data          jsonb;
BEGIN
  IF p_student_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Student')
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  v_mark_label := trim(to_char(p_marked_at, 'FMHH12:MI AM'));
  v_date_label := to_char(p_session_date, 'FMMon DD, YYYY');

  v_parent_body := format(
    '%s was marked present at %s on %s for %s (class %s).',
    v_student_name,
    v_mark_label,
    v_date_label,
    coalesce(nullif(trim(p_group_name), ''), 'class'),
    coalesce(nullif(trim(p_class_label), ''), '—')
  );

  v_student_body := format(
    'Hi %s, your attendance was recorded at %s on %s for %s (class %s).',
    v_student_name,
    v_mark_label,
    v_date_label,
    coalesce(nullif(trim(p_group_name), ''), 'class'),
    coalesce(nullif(trim(p_class_label), ''), '—')
  );

  v_data := jsonb_build_object(
    'type', 'attendance_marked',
    'student_user_id', p_student_user_id,
    'student_name', v_student_name,
    'group_id', p_group_id,
    'group_source', p_group_source,
    'group_name', p_group_name,
    'schedule_id', p_schedule_id,
    'session_id', p_session_id,
    'session_date', p_session_date::text,
    'class_label', p_class_label,
    'marked_at', v_mark_label,
    'route', '/parent-dashboard/attendance'
  );

  FOR v_parent_id IN
    SELECT psl.parent_user_id
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = p_student_user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (v_parent_id, v_parent_title, v_parent_body, v_data);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (p_student_user_id, v_student_title, v_student_body, v_data);
  v_count := v_count + 1;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_save_attendance_for_slot(
  p_group_id              uuid,
  p_schedule_id           uuid,
  p_group_source          text DEFAULT 'institute',
  p_session_date          date DEFAULT NULL,
  p_marks                 jsonb DEFAULT '[]'::jsonb,
  p_marked_at             time DEFAULT NULL,
  p_emit_notifications    boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           uuid := auth.uid();
  v_date           date := COALESCE(p_session_date, CURRENT_DATE);
  v_src            text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_marked_at      time := COALESCE(p_marked_at, LOCALTIME);
  v_session        uuid;
  v_mark           jsonb;
  v_sid            uuid;
  v_present        boolean;
  v_student        uuid;
  v_roster         uuid;
  v_was_present    boolean;
  v_group_name     text;
  v_class_label    text;
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

    SELECT pg.name,
      to_char(gs.start_time, 'HH24:MI') || '–' || to_char(gs.end_time, 'HH24:MI')
    INTO v_group_name, v_class_label
    FROM public.group_schedules gs
    INNER JOIN public.teacher_personal_groups pg ON pg.id = gs.teacher_personal_group_id
    WHERE gs.id = p_schedule_id;

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
      v_was_present := NULL;

      IF v_roster IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.teacher_personal_roster_entries r
          WHERE r.id = v_roster AND r.teacher_personal_group_id = p_group_id
        ) THEN
          CONTINUE;
        END IF;
        SELECT r.student_user_id INTO v_student
        FROM public.teacher_personal_roster_entries r
        WHERE r.id = v_roster;

        IF v_student IS NOT NULL THEN
          SELECT m.present INTO v_was_present
          FROM public.group_attendance_marks m
          WHERE m.session_id = v_session AND m.student_user_id = v_student;
        ELSE
          SELECT m.present INTO v_was_present
          FROM public.group_attendance_marks m
          WHERE m.session_id = v_session AND m.personal_roster_id = v_roster;
        END IF;

        INSERT INTO public.group_attendance_marks (session_id, personal_roster_id, present)
        VALUES (v_session, v_roster, v_present)
        ON CONFLICT (session_id, personal_roster_id) WHERE personal_roster_id IS NOT NULL
        DO UPDATE SET present = EXCLUDED.present, recorded_at = now();
      ELSIF v_student IS NOT NULL THEN
        SELECT m.present INTO v_was_present
        FROM public.group_attendance_marks m
        WHERE m.session_id = v_session AND m.student_user_id = v_student;

        INSERT INTO public.group_attendance_marks (session_id, student_user_id, present)
        VALUES (v_session, v_student, v_present)
        ON CONFLICT (session_id, student_user_id) WHERE student_user_id IS NOT NULL
        DO UPDATE SET present = EXCLUDED.present, recorded_at = now();
      ELSE
        CONTINUE;
      END IF;

      IF p_emit_notifications
        AND v_present
        AND COALESCE(v_was_present, false) = false
        AND v_student IS NOT NULL
      THEN
        PERFORM public.notify_attendance_marked(
          v_student,
          p_group_id,
          v_src,
          v_group_name,
          p_schedule_id,
          v_session,
          v_date,
          v_class_label,
          v_marked_at
        );
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

    SELECT lg.name,
      to_char(gs.start_time, 'HH24:MI') || '–' || to_char(gs.end_time, 'HH24:MI')
    INTO v_group_name, v_class_label
    FROM public.group_schedules gs
    INNER JOIN public.lecture_groups lg ON lg.id = gs.lecture_group_id
    WHERE gs.id = p_schedule_id;

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

      SELECT m.present INTO v_was_present
      FROM public.group_attendance_marks m
      WHERE m.session_id = v_session AND m.student_user_id = v_student;

      INSERT INTO public.group_attendance_marks (session_id, student_user_id, present)
      VALUES (v_session, v_student, v_present)
      ON CONFLICT (session_id, student_user_id) WHERE student_user_id IS NOT NULL
      DO UPDATE SET present = EXCLUDED.present, recorded_at = now();

      IF p_emit_notifications
        AND v_present
        AND COALESCE(v_was_present, false) = false
      THEN
        PERFORM public.notify_attendance_marked(
          v_student,
          p_group_id,
          v_src,
          v_group_name,
          p_schedule_id,
          v_session,
          v_date,
          v_class_label,
          v_marked_at
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_mark_attendance_by_scan(
  p_student_user_id uuid,
  p_session_date    date DEFAULT NULL,
  p_local_time      text DEFAULT NULL,
  p_group_id        uuid DEFAULT NULL,
  p_group_source    text DEFAULT NULL,
  p_schedule_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher       uuid := auth.uid();
  v_date          date := COALESCE(p_session_date, CURRENT_DATE);
  v_dow           int  := EXTRACT(DOW FROM v_date)::int;
  v_year          int  := EXTRACT(YEAR FROM v_date)::int;
  v_now           time := COALESCE(NULLIF(trim(p_local_time), '')::time, LOCALTIME);
  v_student       uuid := p_student_user_id;
  v_student_name  text;
  v_group_id      uuid;
  v_group_source  text;
  v_schedule_id   uuid;
  v_group_name    text;
  v_start_time    time;
  v_end_time      time;
  v_session_id    uuid;
  v_already       boolean := false;
  v_parents       int := 0;
  v_class_label   text;
  v_mark_label    text;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_student IS NULL THEN RAISE EXCEPTION 'student_user_id_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_student) THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Student') INTO v_student_name
  FROM public.profiles p WHERE p.id = v_student;

  IF p_group_id IS NOT NULL AND p_schedule_id IS NOT NULL THEN
    v_group_id := p_group_id;
    v_group_source := lower(trim(COALESCE(p_group_source, 'institute')));
    v_schedule_id := p_schedule_id;

    IF v_group_source = 'personal' THEN
      IF NOT public.teacher_owns_personal_group(v_group_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.teacher_personal_roster_entries r
        WHERE r.teacher_personal_group_id = v_group_id AND r.student_user_id = v_student
      ) THEN RAISE EXCEPTION 'student_not_in_group'; END IF;
      SELECT pg.name, gs.start_time, gs.end_time INTO v_group_name, v_start_time, v_end_time
      FROM public.group_schedules gs
      INNER JOIN public.teacher_personal_groups pg ON pg.id = gs.teacher_personal_group_id
      WHERE gs.id = v_schedule_id AND gs.teacher_personal_group_id = v_group_id;
    ELSE
      IF NOT public.teacher_can_access_lecture_group(v_group_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.lecture_group_students lgs
        WHERE lgs.lecture_group_id = v_group_id AND lgs.student_user_id = v_student
      ) THEN RAISE EXCEPTION 'student_not_in_group'; END IF;
      SELECT lg.name, gs.start_time, gs.end_time INTO v_group_name, v_start_time, v_end_time
      FROM public.group_schedules gs
      INNER JOIN public.lecture_groups lg ON lg.id = gs.lecture_group_id
      WHERE gs.id = v_schedule_id AND gs.lecture_group_id = v_group_id;
    END IF;
    IF v_group_name IS NULL THEN RAISE EXCEPTION 'schedule_not_in_group'; END IF;
  ELSE
    WITH candidates AS (
      SELECT lg.id AS group_id, 'institute'::text AS group_source, gs.id AS schedule_id,
        lg.name AS group_name, gs.start_time, gs.end_time,
        CASE
          WHEN ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date))
            AND v_now BETWEEN gs.start_time AND gs.end_time THEN 0
          WHEN ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date))
            AND v_now < gs.start_time THEN 1
          WHEN (gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date) THEN 2
          ELSE 3
        END AS priority,
        ABS(EXTRACT(EPOCH FROM (gs.start_time - v_now))) AS time_distance
      FROM public.lecture_group_students lgs
      INNER JOIN public.lecture_groups lg ON lg.id = lgs.lecture_group_id
      INNER JOIN public.group_schedules gs ON gs.lecture_group_id = lg.id
      WHERE lgs.student_user_id = v_student AND public.teacher_can_access_lecture_group(lg.id)
      UNION ALL
      SELECT pg.id, 'personal'::text, gs.id, pg.name, gs.start_time, gs.end_time,
        CASE
          WHEN ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date))
            AND v_now BETWEEN gs.start_time AND gs.end_time THEN 0
          WHEN ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date))
            AND v_now < gs.start_time THEN 1
          WHEN (gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
             OR (gs.kind = 'one_time' AND gs.class_date = v_date) THEN 2
          ELSE 3
        END,
        ABS(EXTRACT(EPOCH FROM (gs.start_time - v_now)))
      FROM public.teacher_personal_roster_entries r
      INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
      INNER JOIN public.group_schedules gs ON gs.teacher_personal_group_id = pg.id
      WHERE r.student_user_id = v_student AND public.teacher_owns_personal_group(pg.id)
    )
    SELECT c.group_id, c.group_source, c.schedule_id, c.group_name, c.start_time, c.end_time
    INTO v_group_id, v_group_source, v_schedule_id, v_group_name, v_start_time, v_end_time
    FROM candidates c
    ORDER BY c.priority, c.time_distance, c.start_time
    LIMIT 1;

    IF v_group_id IS NULL THEN RAISE EXCEPTION 'student_not_in_your_classes'; END IF;
  END IF;

  v_class_label := to_char(v_start_time, 'HH24:MI') || '–' || to_char(v_end_time, 'HH24:MI');
  v_mark_label := trim(to_char(v_now, 'FMHH12:MI AM'));

  SELECT EXISTS (
    SELECT 1 FROM public.group_attendance_sessions s
    INNER JOIN public.group_attendance_marks m ON m.session_id = s.id
    WHERE s.schedule_id = v_schedule_id AND s.session_date = v_date
      AND m.student_user_id = v_student AND m.present = true
      AND ((v_group_source = 'institute' AND s.lecture_group_id = v_group_id)
        OR (v_group_source = 'personal' AND s.teacher_personal_group_id = v_group_id))
  ) INTO v_already;

  v_session_id := public.teacher_save_attendance_for_slot(
    v_group_id,
    v_schedule_id,
    v_group_source,
    v_date,
    jsonb_build_array(jsonb_build_object('student_user_id', v_student, 'present', true)),
    v_now,
    false
  );

  IF NOT v_already THEN
    v_parents := public.notify_attendance_marked(
      v_student,
      v_group_id,
      v_group_source,
      v_group_name,
      v_schedule_id,
      v_session_id,
      v_date,
      v_class_label,
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'student_user_id', v_student,
    'student_name', v_student_name,
    'group_id', v_group_id,
    'group_source', v_group_source,
    'group_name', v_group_name,
    'schedule_id', v_schedule_id,
    'class_label', v_class_label,
    'session_date', v_date,
    'marked_at', v_mark_label,
    'already_present', v_already,
    'notifications_sent', v_parents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_attendance_marked(uuid, uuid, text, text, uuid, uuid, date, text, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_attendance_marked(uuid, uuid, text, text, uuid, uuid, date, text, time) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_save_attendance_for_slot(uuid, uuid, text, date, jsonb, time, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_save_attendance_for_slot(uuid, uuid, text, date, jsonb, time, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_mark_attendance_by_scan(uuid, date, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_mark_attendance_by_scan(uuid, date, text, uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
