-- Absence alerts: notify 30 minutes after class start if still not present.
--
-- Example: class 8:00 PM – 10:00 PM
--   - Reminder (process_daily_class_schedule_notifications): 6:00 PM (2h before)
--   - Present (notify_attendance_marked): when QR / mark is saved
--   - Absence (this function): 8:30 PM if still unmarked present
--
-- Also fixes the same timezone double-shift bug that affected daily class notices:
-- `timezone(tz, now())` is already local wall-clock `timestamp`; do not wrap it
-- in timestamptz and apply AT TIME ZONE again.

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
      lg.name AS group_name
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
      pg.name
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
          '%s has not arrived for %s yet. Class started at %s (%s).',
          v_student_name,
          coalesce(v_row.group_name, 'class'),
          v_start_label,
          v_time_label
        );

        v_student_body := format(
          'Hi %s, you have not been marked present for %s yet. Class started at %s (%s).',
          v_student_name,
          coalesce(v_row.group_name, 'class'),
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
          '%s has not arrived for %s yet. Class started at %s (%s).',
          v_student_name,
          coalesce(v_row.group_name, 'class'),
          v_start_label,
          v_time_label
        );

        v_student_body := format(
          'Hi %s, you have not been marked present for %s yet. Class started at %s (%s).',
          v_student_name,
          coalesce(v_row.group_name, 'class'),
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

COMMENT ON FUNCTION public.process_attendance_absence_alerts(text, int, int) IS
  'Alerts student + parents when still unmarked present p_delay_minutes (default 30) after class start, within a p_grace_minutes catch-up window.';

COMMENT ON TABLE public.attendance_absence_alert_dispatches IS
  'Tracks one absence alert per recipient when a student is still unmarked 30m after class start.';

-- Drop old 1-arg overload so callers use the new signature.
DROP FUNCTION IF EXISTS public.process_attendance_absence_alerts(text);

REVOKE ALL ON FUNCTION public.process_attendance_absence_alerts(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_attendance_absence_alerts(text, int, int) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('wovello-attendance-absence-alerts');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'wovello-attendance-absence-alerts',
      '* * * * *',
      $$SELECT public.process_attendance_absence_alerts('Asia/Colombo', 30, 15)$$
    );
  END IF;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
