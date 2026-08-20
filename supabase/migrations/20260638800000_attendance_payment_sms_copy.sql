-- Attendance / payment SMS + push copy:
-- present: teacher name + mark time
-- absent: teacher name + today's class start time (same event as push)
-- payment: teacher name; teacher also gets a push (SMS still only to parent/student)

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
  v_teacher_name  text;
  v_mark_label    text;
  v_date_label    text;
  v_parent_id     uuid;
  v_count         int := 0;
  v_parent_title  text := 'Attendance recorded';
  v_student_title text := 'Attendance recorded';
  v_parent_body   text;
  v_student_body  text;
  v_data          jsonb;
  v_teacher       uuid := auth.uid();
BEGIN
  IF p_student_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Student')
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Teacher')
  INTO v_teacher_name
  FROM public.profiles p
  WHERE p.id = v_teacher;

  IF v_teacher_name IS NULL OR length(trim(v_teacher_name)) = 0 THEN
    v_teacher_name := 'Teacher';
  END IF;

  v_mark_label := trim(to_char(p_marked_at, 'FMHH12:MI AM'));
  v_date_label := to_char(p_session_date, 'FMMon DD, YYYY');

  v_parent_body := format(
    '%s marked %s present at %s on %s for %s (class %s).',
    v_teacher_name,
    v_student_name,
    v_mark_label,
    v_date_label,
    coalesce(nullif(trim(p_group_name), ''), 'class'),
    coalesce(nullif(trim(p_class_label), ''), '—')
  );

  v_student_body := format(
    'Hi %s, %s marked you present at %s on %s for %s (class %s).',
    v_student_name,
    v_teacher_name,
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
    'teacher_user_id', v_teacher,
    'teacher_name', v_teacher_name,
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

CREATE OR REPLACE FUNCTION public.notify_student_class_fee_paid(
  p_student_user_id uuid,
  p_group_name text,
  p_amount_cents integer,
  p_billing_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_teacher_name text;
  v_amount_label text;
  v_month_label text;
  v_parent uuid;
  v_teacher uuid := auth.uid();
  v_data jsonb;
BEGIN
  IF p_student_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Student'
  )
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Teacher')
  INTO v_teacher_name
  FROM public.profiles p
  WHERE p.id = v_teacher;

  IF v_teacher_name IS NULL OR length(trim(v_teacher_name)) = 0 THEN
    v_teacher_name := 'Teacher';
  END IF;

  v_amount_label := public.format_lkr_from_cents(p_amount_cents);
  v_month_label := to_char(COALESCE(p_billing_month, public.current_billing_month()), 'Month YYYY');

  v_data := jsonb_build_object(
    'type', 'class_fee_paid',
    'student_user_id', p_student_user_id,
    'student_name', v_student_name,
    'group_name', p_group_name,
    'amount_cents', p_amount_cents,
    'billing_month', p_billing_month,
    'teacher_user_id', v_teacher,
    'teacher_name', v_teacher_name,
    'route', '/parent-dashboard/classes'
  );

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    p_student_user_id,
    'Class payment complete',
    format(
      'Your payment of %s for %s was received by %s for %s.',
      v_amount_label,
      COALESCE(NULLIF(trim(p_group_name), ''), 'your class'),
      v_teacher_name,
      v_month_label
    ),
    v_data
  );

  FOR v_parent IN
    SELECT psl.parent_user_id
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = p_student_user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_parent,
      'Class payment complete',
      format(
        '%s''s payment of %s for %s was received by %s for %s.',
        v_student_name,
        v_amount_label,
        COALESCE(NULLIF(trim(p_group_name), ''), 'class'),
        v_teacher_name,
        v_month_label
      ),
      v_data
    );
  END LOOP;

  IF v_teacher IS NOT NULL AND v_teacher <> p_student_user_id THEN
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_teacher,
      'Payment received',
      format(
        '%s paid %s for %s (%s).',
        v_student_name,
        v_amount_label,
        COALESCE(NULLIF(trim(p_group_name), ''), 'class'),
        v_month_label
      ),
      v_data || jsonb_build_object('route', '/teacher-dashboard')
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_attendance_absence_alerts(
  p_timezone text DEFAULT 'Asia/Colombo',
  p_delay_minutes int DEFAULT 30,
  p_grace_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz              text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Colombo');
  v_delay           int := greatest(coalesce(p_delay_minutes, 30), 0);
  v_grace           int := greatest(coalesce(p_grace_minutes, 15), 1);
  v_now_local       timestamp;
  v_today           date;
  v_row             record;
  v_alert_at        timestamp;
  v_student         uuid;
  v_parent          uuid;
  v_student_name    text;
  v_teacher_name    text;
  v_start_label     text;
  v_time_label      text;
  v_title           text := 'Class absence alert';
  v_parent_body     text;
  v_student_body    text;
  v_notifications   int := 0;
  v_occurrences     int := 0;
  v_considered      int := 0;
  v_data            jsonb;
BEGIN
  v_now_local := timezone(v_tz, now());
  v_today := v_now_local::date;

  FOR v_row IN
    SELECT
      gs.id AS schedule_id,
      gs.start_time,
      gs.end_time,
      lg.id AS lecture_group_id,
      NULL::uuid AS teacher_personal_group_id,
      'institute'::text AS group_source,
      lg.name AS group_name,
      lg.primary_teacher_user_id AS teacher_user_id
    FROM public.group_schedules gs
    INNER JOIN public.lecture_groups lg ON lg.id = gs.lecture_group_id
    WHERE gs.lecture_group_id IS NOT NULL
      AND (
        (gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = extract(year FROM v_today)::int
          AND gs.day_of_week = extract(dow FROM v_today)::int)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )

    UNION ALL

    SELECT
      gs.id,
      gs.start_time,
      gs.end_time,
      NULL::uuid,
      pg.id,
      'personal'::text,
      pg.name,
      pg.teacher_user_id
    FROM public.group_schedules gs
    INNER JOIN public.teacher_personal_groups pg ON pg.id = gs.teacher_personal_group_id
    WHERE gs.teacher_personal_group_id IS NOT NULL
      AND (
        (gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = extract(year FROM v_today)::int
          AND gs.day_of_week = extract(dow FROM v_today)::int)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )
    ORDER BY start_time
  LOOP
    v_considered := v_considered + 1;
    v_alert_at := (v_today + v_row.start_time) + make_interval(mins => v_delay);

    IF v_now_local < v_alert_at
      OR v_now_local >= v_alert_at + make_interval(mins => v_grace)
    THEN
      CONTINUE;
    END IF;

    v_occurrences := v_occurrences + 1;
    v_start_label := public.format_schedule_time_12h(v_row.start_time);
    v_time_label := public.build_class_time_range_label(v_row.start_time, v_row.end_time);

    SELECT coalesce(nullif(trim(p.full_name), ''), 'Teacher')
    INTO v_teacher_name
    FROM public.profiles p
    WHERE p.id = v_row.teacher_user_id;

    IF v_teacher_name IS NULL OR length(trim(v_teacher_name)) = 0 THEN
      v_teacher_name := 'Teacher';
    END IF;

    IF v_row.group_source = 'personal' THEN
      FOR v_student IN
        SELECT DISTINCT r.student_user_id
        FROM public.teacher_personal_roster_entries r
        WHERE r.teacher_personal_group_id = v_row.teacher_personal_group_id
          AND r.student_user_id IS NOT NULL
      LOOP
        IF public.student_marked_present_for_slot(
          v_row.schedule_id,
          v_today,
          v_student,
          v_row.teacher_personal_group_id
        ) THEN
          CONTINUE;
        END IF;

        SELECT coalesce(nullif(trim(p.full_name), ''), 'Student')
        INTO v_student_name
        FROM public.profiles p
        WHERE p.id = v_student;

        v_parent_body := format(
          '%s was absent from %s''s class. Class started at %s (%s).',
          v_student_name,
          v_teacher_name,
          v_start_label,
          v_time_label
        );

        v_student_body := format(
          'Hi %s, you were marked absent for %s''s class that started at %s (%s).',
          v_student_name,
          v_teacher_name,
          v_start_label,
          v_time_label
        );

        v_data := jsonb_build_object(
          'type', 'attendance_not_arrived',
          'accent', 'danger',
          'student_user_id', v_student,
          'student_name', v_student_name,
          'schedule_id', v_row.schedule_id,
          'group_id', v_row.teacher_personal_group_id,
          'group_source', 'personal',
          'group_name', v_row.group_name,
          'occurrence_date', v_today::text,
          'start_time', to_char(v_row.start_time, 'HH24:MI'),
          'end_time', to_char(v_row.end_time, 'HH24:MI'),
          'time_label', v_time_label,
          'delay_minutes', v_delay,
          'teacher_user_id', v_row.teacher_user_id,
          'teacher_name', v_teacher_name,
          'route', '/parent-dashboard/attendance'
        );

        IF NOT EXISTS (
          SELECT 1 FROM public.attendance_absence_alert_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.student_user_id = v_student
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.attendance_absence_alert_dispatches (
            schedule_id, occurrence_date, student_user_id, user_id
          )
          VALUES (v_row.schedule_id, v_today, v_student, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (v_student, v_title, v_student_body, v_data);
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.attendance_absence_alert_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.student_user_id = v_student
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.attendance_absence_alert_dispatches (
              schedule_id, occurrence_date, student_user_id, user_id
            )
            VALUES (v_row.schedule_id, v_today, v_student, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (v_parent, v_title, v_parent_body, v_data);
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;
    ELSE
      FOR v_student IN
        SELECT DISTINCT lgs.student_user_id
        FROM public.lecture_group_students lgs
        WHERE lgs.lecture_group_id = v_row.lecture_group_id
      LOOP
        IF public.student_marked_present_for_slot(
          v_row.schedule_id,
          v_today,
          v_student,
          NULL
        ) THEN
          CONTINUE;
        END IF;

        SELECT coalesce(nullif(trim(p.full_name), ''), 'Student')
        INTO v_student_name
        FROM public.profiles p
        WHERE p.id = v_student;

        v_parent_body := format(
          '%s was absent from %s''s class. Class started at %s (%s).',
          v_student_name,
          v_teacher_name,
          v_start_label,
          v_time_label
        );

        v_student_body := format(
          'Hi %s, you were marked absent for %s''s class that started at %s (%s).',
          v_student_name,
          v_teacher_name,
          v_start_label,
          v_time_label
        );

        v_data := jsonb_build_object(
          'type', 'attendance_not_arrived',
          'accent', 'danger',
          'student_user_id', v_student,
          'student_name', v_student_name,
          'schedule_id', v_row.schedule_id,
          'group_id', v_row.lecture_group_id,
          'group_source', 'institute',
          'group_name', v_row.group_name,
          'occurrence_date', v_today::text,
          'start_time', to_char(v_row.start_time, 'HH24:MI'),
          'end_time', to_char(v_row.end_time, 'HH24:MI'),
          'time_label', v_time_label,
          'delay_minutes', v_delay,
          'teacher_user_id', v_row.teacher_user_id,
          'teacher_name', v_teacher_name,
          'route', '/parent-dashboard/attendance'
        );

        IF NOT EXISTS (
          SELECT 1 FROM public.attendance_absence_alert_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.student_user_id = v_student
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.attendance_absence_alert_dispatches (
            schedule_id, occurrence_date, student_user_id, user_id
          )
          VALUES (v_row.schedule_id, v_today, v_student, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (v_student, v_title, v_student_body, v_data);
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.attendance_absence_alert_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.student_user_id = v_student
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.attendance_absence_alert_dispatches (
              schedule_id, occurrence_date, student_user_id, user_id
            )
            VALUES (v_row.schedule_id, v_today, v_student, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (v_parent, v_title, v_parent_body, v_data);
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'timezone', v_tz,
    'local_time', to_char(v_now_local, 'YYYY-MM-DD HH24:MI'),
    'occurrence_date', v_today,
    'delay_minutes', v_delay,
    'grace_minutes', v_grace,
    'schedules_today', v_considered,
    'classes_in_window', v_occurrences,
    'notifications_sent', v_notifications
  );
END;
$$;

COMMENT ON FUNCTION public.notify_attendance_marked(uuid, uuid, text, text, uuid, uuid, date, text, time) IS
  'Push + SMS (if teacher attendance SMS is on): teacher name and mark time.';

COMMENT ON FUNCTION public.notify_student_class_fee_paid(uuid, text, integer, date) IS
  'Push to student, parents, and teacher. SMS to student/parents only if teacher payments SMS is on.';

COMMENT ON FUNCTION public.process_attendance_absence_alerts(text, int, int) IS
  'Push + SMS (if teacher attendance SMS is on) when still unmarked 30m after class start.';

NOTIFY pgrst, 'reload schema';
