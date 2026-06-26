-- Daily morning alerts for today's scheduled classes (students, parents, and teachers).
-- Complements the existing 2-hour class_reminder job.

CREATE TABLE IF NOT EXISTS public.class_daily_schedule_dispatches (
  schedule_id     uuid NOT NULL REFERENCES public.group_schedules (id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, occurrence_date, user_id)
);

COMMENT ON TABLE public.class_daily_schedule_dispatches IS
  'Tracks once-per-day class schedule alerts (students, parents, and teachers).';

ALTER TABLE public.class_daily_schedule_dispatches ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.format_schedule_time_12h(p_time time)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(to_char(p_time, 'FMHH12:MI AM'));
$$;

CREATE OR REPLACE FUNCTION public.build_class_time_range_label(p_start time, p_end time)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.format_schedule_time_12h(p_start)
    || ' – '
    || public.format_schedule_time_12h(p_end);
$$;

CREATE OR REPLACE FUNCTION public.process_daily_class_schedule_notifications(
  p_timezone text DEFAULT 'Asia/Colombo',
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz                text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Colombo');
  v_now_local         timestamptz;
  v_today             date;
  v_dow               int;
  v_year              int;
  v_local_time        time;
  v_window_start      time := time '06:25';
  v_window_end        time := time '06:35';
  v_row               record;
  v_time_label        text;
  v_title             text;
  v_body              text;
  v_parent_body       text;
  v_student           uuid;
  v_parent            uuid;
  v_teacher           uuid;
  v_notifications     int := 0;
  v_occurrences       int := 0;
BEGIN
  v_now_local := timezone(v_tz, now());
  v_today := (v_now_local AT TIME ZONE v_tz)::date;
  v_dow := extract(dow FROM (v_now_local AT TIME ZONE v_tz))::int;
  v_year := extract(year FROM (v_now_local AT TIME ZONE v_tz))::int;
  v_local_time := (v_now_local AT TIME ZONE v_tz)::time;

  IF NOT p_force AND (v_local_time < v_window_start OR v_local_time > v_window_end) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'outside_dispatch_window',
      'timezone', v_tz,
      'local_time', v_local_time::text
    );
  END IF;

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
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow)
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
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )
    ORDER BY start_time
  LOOP
    v_occurrences := v_occurrences + 1;
    v_time_label := public.build_class_time_range_label(v_row.start_time, v_row.end_time);
    v_title := format('Class today: %s', coalesce(v_row.group_name, 'Class'));
    v_body := format(
      '%s is scheduled today from %s to %s.',
      coalesce(v_row.group_name, 'Your class'),
      public.format_schedule_time_12h(v_row.start_time),
      public.format_schedule_time_12h(v_row.end_time)
    );
    v_parent_body := format(
      'Class %s is scheduled today from %s to %s.',
      coalesce(v_row.group_name, 'class'),
      public.format_schedule_time_12h(v_row.start_time),
      public.format_schedule_time_12h(v_row.end_time)
    );

    IF v_row.group_source = 'personal' THEN
      FOR v_student IN
        SELECT DISTINCT r.student_user_id
        FROM public.teacher_personal_roster_entries r
        WHERE r.teacher_personal_group_id = v_row.teacher_personal_group_id
          AND r.student_user_id IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_daily_schedule_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_student,
            v_title,
            v_body,
            jsonb_build_object(
              'type', 'class_daily_schedule',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.teacher_personal_group_id,
              'group_source', 'personal',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/parent-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.class_daily_schedule_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
            VALUES (v_row.schedule_id, v_today, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (
              v_parent,
              v_title,
              v_parent_body,
              jsonb_build_object(
                'type', 'class_daily_schedule',
                'schedule_id', v_row.schedule_id,
                'student_user_id', v_student,
                'group_id', v_row.teacher_personal_group_id,
                'group_source', 'personal',
                'group_name', v_row.group_name,
                'occurrence_date', v_today::text,
                'start_time', to_char(v_row.start_time, 'HH24:MI'),
                'end_time', to_char(v_row.end_time, 'HH24:MI'),
                'time_label', v_time_label,
                'route', '/parent-dashboard'
              )
            );
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;

      SELECT pg.teacher_user_id INTO v_teacher
      FROM public.teacher_personal_groups pg
      WHERE pg.id = v_row.teacher_personal_group_id;

      IF v_teacher IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.class_daily_schedule_dispatches d
        WHERE d.schedule_id = v_row.schedule_id
          AND d.occurrence_date = v_today
          AND d.user_id = v_teacher
      ) THEN
        INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
        VALUES (v_row.schedule_id, v_today, v_teacher);

        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_teacher,
          v_title,
          v_body,
          jsonb_build_object(
            'type', 'class_daily_schedule',
            'schedule_id', v_row.schedule_id,
            'group_id', v_row.teacher_personal_group_id,
            'group_source', 'personal',
            'group_name', v_row.group_name,
            'occurrence_date', v_today::text,
            'start_time', to_char(v_row.start_time, 'HH24:MI'),
            'end_time', to_char(v_row.end_time, 'HH24:MI'),
            'time_label', v_time_label,
            'route', '/teacher-dashboard'
          )
        );
        v_notifications := v_notifications + 1;
      END IF;
    ELSE
      FOR v_student IN
        SELECT DISTINCT lgs.student_user_id
        FROM public.lecture_group_students lgs
        WHERE lgs.lecture_group_id = v_row.lecture_group_id
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_daily_schedule_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_student,
            v_title,
            v_body,
            jsonb_build_object(
              'type', 'class_daily_schedule',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.lecture_group_id,
              'group_source', 'institute',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/parent-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.class_daily_schedule_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
            VALUES (v_row.schedule_id, v_today, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (
              v_parent,
              v_title,
              v_parent_body,
              jsonb_build_object(
                'type', 'class_daily_schedule',
                'schedule_id', v_row.schedule_id,
                'student_user_id', v_student,
                'group_id', v_row.lecture_group_id,
                'group_source', 'institute',
                'group_name', v_row.group_name,
                'occurrence_date', v_today::text,
                'start_time', to_char(v_row.start_time, 'HH24:MI'),
                'end_time', to_char(v_row.end_time, 'HH24:MI'),
                'time_label', v_time_label,
                'route', '/parent-dashboard'
              )
            );
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;

      FOR v_teacher IN
        SELECT DISTINCT t.teacher_user_id
        FROM (
          SELECT gt.teacher_user_id
          FROM public.lecture_group_teachers gt
          WHERE gt.lecture_group_id = v_row.lecture_group_id
          UNION
          SELECT lg.primary_teacher_user_id
          FROM public.lecture_groups lg
          WHERE lg.id = v_row.lecture_group_id
            AND lg.primary_teacher_user_id IS NOT NULL
        ) t
        WHERE t.teacher_user_id IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_daily_schedule_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_teacher
        ) THEN
          INSERT INTO public.class_daily_schedule_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_teacher);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_teacher,
            v_title,
            v_body,
            jsonb_build_object(
              'type', 'class_daily_schedule',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.lecture_group_id,
              'group_source', 'institute',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/teacher-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'timezone', v_tz,
    'occurrence_date', v_today,
    'occurrences', v_occurrences,
    'notifications_sent', v_notifications
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_daily_class_schedule_notifications(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_daily_class_schedule_notifications(text, boolean) TO service_role;

-- Improve 2-hour reminders: include explicit start/end times in body and payload.
CREATE OR REPLACE FUNCTION public.process_class_start_reminders(
  p_timezone text DEFAULT 'Asia/Colombo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz              text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Colombo');
  v_now_local       timestamptz;
  v_today           date;
  v_dow             int;
  v_year            int;
  v_window_start    timestamptz;
  v_window_end      timestamptz;
  v_row             record;
  v_class_start     timestamptz;
  v_time_label      text;
  v_start_label     text;
  v_end_label       text;
  v_title           text := 'Class starting in 2 hours';
  v_body            text;
  v_parent_body     text;
  v_route           text;
  v_student         uuid;
  v_parent          uuid;
  v_teacher         uuid;
  v_notifications   int := 0;
  v_occurrences     int := 0;
BEGIN
  v_now_local := timezone(v_tz, now());
  v_today := (v_now_local AT TIME ZONE v_tz)::date;
  v_dow := extract(dow FROM (v_now_local AT TIME ZONE v_tz))::int;
  v_year := extract(year FROM (v_now_local AT TIME ZONE v_tz))::int;
  v_window_start := v_now_local + interval '1 hour 55 minutes';
  v_window_end := v_now_local + interval '2 hours 5 minutes';

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
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow)
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
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )
  LOOP
    v_class_start := ((v_today + v_row.start_time) AT TIME ZONE v_tz);

    IF v_class_start < v_window_start OR v_class_start > v_window_end THEN
      CONTINUE;
    END IF;

    v_occurrences := v_occurrences + 1;
    v_start_label := public.format_schedule_time_12h(v_row.start_time);
    v_end_label := public.format_schedule_time_12h(v_row.end_time);
    v_time_label := v_start_label || ' – ' || v_end_label;
    v_body := format(
      '%s starts at %s and ends at %s (in about 2 hours).',
      coalesce(v_row.group_name, 'Your class'),
      v_start_label,
      v_end_label
    );
    v_parent_body := format(
      'Class %s runs from %s to %s (starts in about 2 hours).',
      coalesce(v_row.group_name, 'class'),
      v_start_label,
      v_end_label
    );

    IF v_row.group_source = 'personal' THEN
      FOR v_student IN
        SELECT DISTINCT r.student_user_id
        FROM public.teacher_personal_roster_entries r
        WHERE r.teacher_personal_group_id = v_row.teacher_personal_group_id
          AND r.student_user_id IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_reminder_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_student,
            v_title,
            v_body,
            jsonb_build_object(
              'type', 'class_reminder',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.teacher_personal_group_id,
              'group_source', 'personal',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/parent-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.class_reminder_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
            VALUES (v_row.schedule_id, v_today, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (
              v_parent,
              v_title,
              v_parent_body,
              jsonb_build_object(
                'type', 'class_reminder',
                'schedule_id', v_row.schedule_id,
                'student_user_id', v_student,
                'group_id', v_row.teacher_personal_group_id,
                'group_source', 'personal',
                'group_name', v_row.group_name,
                'occurrence_date', v_today::text,
                'start_time', to_char(v_row.start_time, 'HH24:MI'),
                'end_time', to_char(v_row.end_time, 'HH24:MI'),
                'time_label', v_time_label,
                'route', '/parent-dashboard'
              )
            );
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;

      SELECT pg.teacher_user_id INTO v_teacher
      FROM public.teacher_personal_groups pg
      WHERE pg.id = v_row.teacher_personal_group_id;

      IF v_teacher IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.class_reminder_dispatches d
        WHERE d.schedule_id = v_row.schedule_id
          AND d.occurrence_date = v_today
          AND d.user_id = v_teacher
      ) THEN
        INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
        VALUES (v_row.schedule_id, v_today, v_teacher);

        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_teacher,
          v_title,
          format(
            '%s starts at %s and ends at %s (in about 2 hours).',
            coalesce(v_row.group_name, 'Your class'),
            v_start_label,
            v_end_label
          ),
          jsonb_build_object(
            'type', 'class_reminder',
            'schedule_id', v_row.schedule_id,
            'group_id', v_row.teacher_personal_group_id,
            'group_source', 'personal',
            'group_name', v_row.group_name,
            'occurrence_date', v_today::text,
            'start_time', to_char(v_row.start_time, 'HH24:MI'),
            'end_time', to_char(v_row.end_time, 'HH24:MI'),
            'time_label', v_time_label,
            'route', '/teacher-dashboard'
          )
        );
        v_notifications := v_notifications + 1;
      END IF;
    ELSE
      FOR v_student IN
        SELECT DISTINCT lgs.student_user_id
        FROM public.lecture_group_students lgs
        WHERE lgs.lecture_group_id = v_row.lecture_group_id
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_reminder_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_student
        ) THEN
          INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_student);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_student,
            v_title,
            v_body,
            jsonb_build_object(
              'type', 'class_reminder',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.lecture_group_id,
              'group_source', 'institute',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/parent-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;

        FOR v_parent IN
          SELECT psl.parent_user_id
          FROM public.parent_student_links psl
          WHERE psl.student_user_id = v_student
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.class_reminder_dispatches d
            WHERE d.schedule_id = v_row.schedule_id
              AND d.occurrence_date = v_today
              AND d.user_id = v_parent
          ) THEN
            INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
            VALUES (v_row.schedule_id, v_today, v_parent);

            INSERT INTO public.notifications (user_id, title, body, data)
            VALUES (
              v_parent,
              v_title,
              v_parent_body,
              jsonb_build_object(
                'type', 'class_reminder',
                'schedule_id', v_row.schedule_id,
                'student_user_id', v_student,
                'group_id', v_row.lecture_group_id,
                'group_source', 'institute',
                'group_name', v_row.group_name,
                'occurrence_date', v_today::text,
                'start_time', to_char(v_row.start_time, 'HH24:MI'),
                'end_time', to_char(v_row.end_time, 'HH24:MI'),
                'time_label', v_time_label,
                'route', '/parent-dashboard'
              )
            );
            v_notifications := v_notifications + 1;
          END IF;
        END LOOP;
      END LOOP;

      FOR v_teacher IN
        SELECT DISTINCT t.teacher_user_id
        FROM (
          SELECT gt.teacher_user_id
          FROM public.lecture_group_teachers gt
          WHERE gt.lecture_group_id = v_row.lecture_group_id
          UNION
          SELECT lg.primary_teacher_user_id
          FROM public.lecture_groups lg
          WHERE lg.id = v_row.lecture_group_id
            AND lg.primary_teacher_user_id IS NOT NULL
        ) t
        WHERE t.teacher_user_id IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.class_reminder_dispatches d
          WHERE d.schedule_id = v_row.schedule_id
            AND d.occurrence_date = v_today
            AND d.user_id = v_teacher
        ) THEN
          INSERT INTO public.class_reminder_dispatches (schedule_id, occurrence_date, user_id)
          VALUES (v_row.schedule_id, v_today, v_teacher);

          INSERT INTO public.notifications (user_id, title, body, data)
          VALUES (
            v_teacher,
            v_title,
            format(
              '%s starts at %s and ends at %s (in about 2 hours).',
              coalesce(v_row.group_name, 'Your class'),
              v_start_label,
              v_end_label
            ),
            jsonb_build_object(
              'type', 'class_reminder',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.lecture_group_id,
              'group_source', 'institute',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', to_char(v_row.start_time, 'HH24:MI'),
              'end_time', to_char(v_row.end_time, 'HH24:MI'),
              'time_label', v_time_label,
              'route', '/teacher-dashboard'
            )
          );
          v_notifications := v_notifications + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'timezone', v_tz,
    'occurrences_in_window', v_occurrences,
    'notifications_sent', v_notifications
  );
END;
$$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('wovello-daily-class-schedule');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'wovello-daily-class-schedule',
      '*/5 * * * *',
      $$SELECT public.process_daily_class_schedule_notifications('Asia/Colombo', false)$$
    );
  END IF;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
