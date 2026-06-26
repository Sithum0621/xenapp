-- Push notifications for new group chat messages + automated 2-hour class start reminders.

-- ---------------------------------------------------------------------------
-- Dedup table for class reminder notifications (per user / schedule / occurrence)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.class_reminder_dispatches (
  schedule_id     uuid NOT NULL REFERENCES public.group_schedules (id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, occurrence_date, user_id)
);

COMMENT ON TABLE public.class_reminder_dispatches IS
  'Tracks class-start reminder pushes so cron does not send duplicates.';

ALTER TABLE public.class_reminder_dispatches ENABLE ROW LEVEL SECURITY;

-- No client access; maintained by SECURITY DEFINER jobs only.

-- ---------------------------------------------------------------------------
-- Notify group members when a chat message is posted
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_notify_group_message(
  p_message_id          uuid,
  p_group_id            uuid,
  p_group_source        text,
  p_sender_user_id      uuid,
  p_body                text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src         text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_group_name  text;
  v_sender_name text;
  v_student     uuid;
  v_parent      uuid;
  v_teacher     uuid;
  v_title       text := 'New class message';
  v_body        text;
  v_parent_body text;
  v_preview     text;
  v_route       text;
  v_sent        int := 0;
BEGIN
  IF p_message_id IS NULL OR p_group_id IS NULL OR p_sender_user_id IS NULL THEN
    RETURN 0;
  END IF;

  v_preview := left(trim(COALESCE(p_body, '')), 120);
  IF length(v_preview) = 0 THEN
    v_preview := 'New message';
  END IF;

  SELECT coalesce(
    nullif(trim(p.full_name), ''),
    nullif(concat_ws(' ', nullif(trim(p.first_name), ''), nullif(trim(p.last_name), '')), ''),
    'Teacher'
  )
  INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = p_sender_user_id;

  IF v_src = 'personal' THEN
    SELECT pg.name INTO v_group_name
    FROM public.teacher_personal_groups pg
    WHERE pg.id = p_group_id;
  ELSE
    SELECT lg.name INTO v_group_name
    FROM public.lecture_groups lg
    WHERE lg.id = p_group_id;
  END IF;

  v_group_name := coalesce(nullif(trim(v_group_name), ''), 'Class');
  v_body := format('%s: %s', v_sender_name, v_preview);
  v_parent_body := format('%s (%s): %s', v_sender_name, v_group_name, v_preview);

  IF v_src = 'personal' THEN
    FOR v_student IN
      SELECT DISTINCT r.student_user_id
      FROM public.teacher_personal_roster_entries r
      WHERE r.teacher_personal_group_id = p_group_id
        AND r.student_user_id IS NOT NULL
        AND r.student_user_id <> p_sender_user_id
    LOOP
      v_route := format(
        '/parent-dashboard/chats/%s?studentId=%s&groupSource=personal',
        p_group_id,
        v_student
      );

      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_student,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_chat_message',
          'message_id', p_message_id,
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'student_user_id', v_student,
          'route', v_route
        )
      );
      v_sent := v_sent + 1;

      FOR v_parent IN
        SELECT psl.parent_user_id
        FROM public.parent_student_links psl
        WHERE psl.student_user_id = v_student
          AND psl.parent_user_id <> p_sender_user_id
      LOOP
        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_parent,
          v_title,
          v_parent_body,
          jsonb_build_object(
            'type', 'group_chat_message',
            'message_id', p_message_id,
            'group_id', p_group_id,
            'group_source', v_src,
            'group_name', v_group_name,
            'student_user_id', v_student,
            'route', v_route
          )
        );
        v_sent := v_sent + 1;
      END LOOP;
    END LOOP;

    SELECT pg.teacher_user_id INTO v_teacher
    FROM public.teacher_personal_groups pg
    WHERE pg.id = p_group_id;

    IF v_teacher IS NOT NULL AND v_teacher <> p_sender_user_id THEN
      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_teacher,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_chat_message',
          'message_id', p_message_id,
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'route', format('/teacher-dashboard/chats/%s?groupSource=personal', p_group_id)
        )
      );
      v_sent := v_sent + 1;
    END IF;
  ELSE
    FOR v_student IN
      SELECT DISTINCT lgs.student_user_id
      FROM public.lecture_group_students lgs
      WHERE lgs.lecture_group_id = p_group_id
        AND lgs.student_user_id <> p_sender_user_id
    LOOP
      v_route := format(
        '/parent-dashboard/chats/%s?studentId=%s&groupSource=institute',
        p_group_id,
        v_student
      );

      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_student,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_chat_message',
          'message_id', p_message_id,
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'student_user_id', v_student,
          'route', v_route
        )
      );
      v_sent := v_sent + 1;

      FOR v_parent IN
        SELECT psl.parent_user_id
        FROM public.parent_student_links psl
        WHERE psl.student_user_id = v_student
          AND psl.parent_user_id <> p_sender_user_id
      LOOP
        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_parent,
          v_title,
          v_parent_body,
          jsonb_build_object(
            'type', 'group_chat_message',
            'message_id', p_message_id,
            'group_id', p_group_id,
            'group_source', v_src,
            'group_name', v_group_name,
            'student_user_id', v_student,
            'route', v_route
          )
        );
        v_sent := v_sent + 1;
      END LOOP;
    END LOOP;

    FOR v_teacher IN
      SELECT DISTINCT t.teacher_user_id
      FROM (
        SELECT gt.teacher_user_id
        FROM public.lecture_group_teachers gt
        WHERE gt.lecture_group_id = p_group_id
        UNION
        SELECT lg.primary_teacher_user_id
        FROM public.lecture_groups lg
        WHERE lg.id = p_group_id
          AND lg.primary_teacher_user_id IS NOT NULL
      ) t
      WHERE t.teacher_user_id IS NOT NULL
        AND t.teacher_user_id <> p_sender_user_id
    LOOP
      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_teacher,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_chat_message',
          'message_id', p_message_id,
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'route', format('/teacher-dashboard/chats/%s?groupSource=institute', p_group_id)
        )
      );
      v_sent := v_sent + 1;
    END LOOP;
  END IF;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_notify_group_message(uuid, uuid, text, uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Send chat message + fan-out notifications
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_send_group_message(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute',
  p_body         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_body   text := trim(COALESCE(p_body, ''));
  v_id     uuid;
  v_admin  boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'message_empty'; END IF;
  IF NOT public.chat_user_can_send() THEN RAISE EXCEPTION 'not_allowed_to_send'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user AND role = 'admin'::public.profile_role_v2
  ) INTO v_admin;

  IF v_source = 'personal' THEN
    IF v_admin THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.teacher_personal_groups WHERE id = p_group_id
      ) THEN
        RAISE EXCEPTION 'group_not_found';
      END IF;
    ELSIF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO public.group_chat_messages (
      teacher_personal_group_id,
      sender_user_id,
      body
    )
    VALUES (p_group_id, v_user, v_body)
    RETURNING id INTO v_id;
  ELSE
    IF v_admin THEN
      IF NOT EXISTS (SELECT 1 FROM public.lecture_groups WHERE id = p_group_id) THEN
        RAISE EXCEPTION 'group_not_found';
      END IF;
    ELSIF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO public.group_chat_messages (
      lecture_group_id,
      sender_user_id,
      body
    )
    VALUES (p_group_id, v_user, v_body)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.chat_notify_group_message(v_id, p_group_id, v_source, v_user, v_body);

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Class reminders: notify students, parents, and teachers ~2 hours before start
-- Uses wall-clock schedule times in p_timezone (default Asia/Colombo).
-- ---------------------------------------------------------------------------

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
    v_time_label := to_char(v_row.start_time, 'HH24:MI')
      || '–' || to_char(v_row.end_time, 'HH24:MI');
    v_body := format('Your class %s starts at %s (in about 2 hours).',
      coalesce(v_row.group_name, 'class'), v_time_label);
    v_parent_body := format('Class %s starts at %s (in about 2 hours).',
      coalesce(v_row.group_name, 'class'), v_time_label);

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
              'start_time', v_time_label,
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
                'start_time', v_time_label,
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
          format('Your class %s starts at %s (in about 2 hours).',
            coalesce(v_row.group_name, 'class'), v_time_label),
          jsonb_build_object(
            'type', 'class_reminder',
            'schedule_id', v_row.schedule_id,
            'group_id', v_row.teacher_personal_group_id,
            'group_source', 'personal',
            'group_name', v_row.group_name,
            'occurrence_date', v_today::text,
            'start_time', v_time_label,
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
              'start_time', v_time_label,
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
                'start_time', v_time_label,
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
            format('Your class %s starts at %s (in about 2 hours).',
              coalesce(v_row.group_name, 'class'), v_time_label),
            jsonb_build_object(
              'type', 'class_reminder',
              'schedule_id', v_row.schedule_id,
              'group_id', v_row.lecture_group_id,
              'group_source', 'institute',
              'group_name', v_row.group_name,
              'occurrence_date', v_today::text,
              'start_time', v_time_label,
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

REVOKE ALL ON FUNCTION public.process_class_start_reminders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_class_start_reminders(text) TO service_role;

NOTIFY pgrst, 'reload schema';
