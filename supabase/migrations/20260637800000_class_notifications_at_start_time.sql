-- Send class notifications at each class's scheduled start time.
--
-- Two bugs are fixed here:
--
-- 1. Timezone double-shift. `timezone(tz, now())` already returns local wall-clock
--    time as `timestamp`. The old function stored it in a `timestamptz` variable
--    (re-anchoring it to the server's UTC zone) and then applied `AT TIME ZONE tz`
--    a second time, pushing every computed value +5:30 ahead of real Colombo time.
--    That made the 06:25–06:35 dispatch window fire around 01:00 local, and
--    `v_today` / `v_dow` roll over to the wrong day at the boundary.
--
-- 2. Fixed morning window. Notices went out in one early-morning batch instead of
--    at the start time set on each schedule. Dispatch is now driven by
--    `group_schedules.start_time`, with `p_lead_minutes` to send ahead of the start
--    and `p_grace_minutes` to tolerate a missed cron tick.
--
-- `class_daily_schedule_dispatches` still dedupes per (schedule, date, user), so
-- overlapping windows cannot produce repeat notifications.
-- The notification `type` stays `class_daily_schedule` for installed-client routing.

DROP FUNCTION IF EXISTS public.process_daily_class_schedule_notifications(text, boolean);

CREATE OR REPLACE FUNCTION public.process_daily_class_schedule_notifications(
  p_timezone text DEFAULT 'Asia/Colombo',
  p_force boolean DEFAULT false,
  p_lead_minutes int DEFAULT 0,
  p_grace_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz            text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Colombo');
  v_lead          int := greatest(coalesce(p_lead_minutes, 0), 0);
  v_grace         int := greatest(coalesce(p_grace_minutes, 15), 1);
  -- Local wall clock: `timezone(tz, now())` is already `timestamp` in that zone.
  v_now_local     timestamp;
  v_today         date;
  v_dow           int;
  v_year          int;
  v_row           record;
  v_trigger_at    timestamp;
  v_time_label    text;
  v_start_label   text;
  v_end_label     text;
  v_title         text;
  v_body          text;
  v_parent_body   text;
  v_student       uuid;
  v_parent        uuid;
  v_teacher       uuid;
  v_notifications int := 0;
  v_occurrences   int := 0;
  v_considered    int := 0;
BEGIN
  v_now_local := timezone(v_tz, now());
  v_today := v_now_local::date;
  v_dow := extract(dow FROM v_now_local)::int;
  v_year := extract(year FROM v_now_local)::int;

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
    v_considered := v_considered + 1;

    -- Fire once the class start time (minus lead) has just passed.
    v_trigger_at := (v_today + v_row.start_time) - make_interval(mins => v_lead);

    IF NOT p_force AND (
      v_now_local < v_trigger_at
      OR v_now_local >= v_trigger_at + make_interval(mins => v_grace)
    ) THEN
      CONTINUE;
    END IF;

    v_occurrences := v_occurrences + 1;
    v_start_label := public.format_schedule_time_12h(v_row.start_time);
    v_end_label := public.format_schedule_time_12h(v_row.end_time);
    v_time_label := v_start_label || ' – ' || v_end_label;
    v_title := format('Class starting: %s', coalesce(v_row.group_name, 'Class'));
    v_body := format(
      '%s starts at %s and ends at %s.',
      coalesce(v_row.group_name, 'Your class'),
      v_start_label,
      v_end_label
    );
    v_parent_body := format(
      'Class %s starts at %s and ends at %s.',
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
              'trigger', 'class_start',
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
                'trigger', 'class_start',
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
            'trigger', 'class_start',
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
              'trigger', 'class_start',
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
                'trigger', 'class_start',
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
              'trigger', 'class_start',
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
    'local_time', to_char(v_now_local, 'YYYY-MM-DD HH24:MI'),
    'occurrence_date', v_today,
    'lead_minutes', v_lead,
    'grace_minutes', v_grace,
    'schedules_today', v_considered,
    'occurrences_in_window', v_occurrences,
    'notifications_sent', v_notifications
  );
END;
$$;

COMMENT ON FUNCTION public.process_daily_class_schedule_notifications(text, boolean, int, int) IS
  'Sends class notifications at each schedule''s start time (minus p_lead_minutes), within a p_grace_minutes catch-up window. p_force ignores the timing window.';

REVOKE ALL ON FUNCTION public.process_daily_class_schedule_notifications(text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_daily_class_schedule_notifications(text, boolean, int, int) TO service_role;

-- Run every minute so a class start time is matched closely instead of drifting
-- up to 5 minutes late.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('wovello-daily-class-schedule');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'wovello-class-start-notifications',
      '* * * * *',
      $$SELECT public.process_daily_class_schedule_notifications('Asia/Colombo', false, 0, 15)$$
    );
  END IF;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
