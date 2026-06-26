-- Attendance scan fallback (no schedule today) + in-app notification RPCs.

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
  v_parent_id     uuid;
  v_notif_title   text;
  v_notif_body    text;
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

  SELECT EXISTS (
    SELECT 1 FROM public.group_attendance_sessions s
    INNER JOIN public.group_attendance_marks m ON m.session_id = s.id
    WHERE s.schedule_id = v_schedule_id AND s.session_date = v_date
      AND m.student_user_id = v_student AND m.present = true
      AND ((v_group_source = 'institute' AND s.lecture_group_id = v_group_id)
        OR (v_group_source = 'personal' AND s.teacher_personal_group_id = v_group_id))
  ) INTO v_already;

  v_session_id := public.teacher_save_attendance_for_slot(
    v_group_id, v_schedule_id, v_group_source, v_date,
    jsonb_build_array(jsonb_build_object('student_user_id', v_student, 'present', true))
  );

  v_notif_title := 'Attendance marked';
  v_notif_body := format('%s was marked present for %s (%s) on %s.',
    v_student_name, coalesce(v_group_name, 'class'), v_class_label, to_char(v_date, 'Mon DD, YYYY'));

  FOR v_parent_id IN
    SELECT psl.parent_user_id FROM public.parent_student_links psl
    WHERE psl.student_user_id = v_student
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (v_parent_id, v_notif_title, v_notif_body, jsonb_build_object(
      'type', 'attendance_marked', 'student_user_id', v_student,
      'group_id', v_group_id, 'group_source', v_group_source,
      'schedule_id', v_schedule_id, 'session_id', v_session_id,
      'session_date', v_date::text, 'route', '/parent-dashboard/attendance'));
    v_parents := v_parents + 1;
  END LOOP;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (v_student, v_notif_title,
    format('You were marked present for %s (%s) on %s.', coalesce(v_group_name, 'class'), v_class_label, to_char(v_date, 'Mon DD, YYYY')),
    jsonb_build_object('type', 'attendance_marked', 'student_user_id', v_student,
      'group_id', v_group_id, 'group_source', v_group_source,
      'schedule_id', v_schedule_id, 'session_id', v_session_id,
      'session_date', v_date::text, 'route', '/parent-dashboard/attendance'));
  v_parents := v_parents + 1;

  RETURN jsonb_build_object('ok', true, 'session_id', v_session_id, 'student_user_id', v_student,
    'student_name', v_student_name, 'group_id', v_group_id, 'group_source', v_group_source,
    'group_name', v_group_name, 'schedule_id', v_schedule_id, 'class_label', v_class_label,
    'session_date', v_date, 'already_present', v_already, 'notifications_sent', v_parents);
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_list_scan_attendance_options(
  p_student_user_id uuid,
  p_session_date    date DEFAULT NULL
)
RETURNS TABLE (
  group_id      uuid,
  group_source  text,
  group_name    text,
  schedule_id   uuid,
  start_time    text,
  end_time      text,
  kind          text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_date    date := COALESCE(p_session_date, CURRENT_DATE);
  v_dow     int  := EXTRACT(DOW FROM v_date)::int;
  v_year    int  := EXTRACT(YEAR FROM v_date)::int;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_student_user_id IS NULL THEN RAISE EXCEPTION 'student_user_id_required'; END IF;

  RETURN QUERY
  WITH today_slots AS (
    SELECT lg.id AS gid, 'institute'::text AS gsrc, lg.name AS gname, gs.id AS sid,
      to_char(gs.start_time, 'HH24:MI') AS st, to_char(gs.end_time, 'HH24:MI') AS et, gs.kind::text AS knd,
      0 AS ord
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups lg ON lg.id = lgs.lecture_group_id
    INNER JOIN public.group_schedules gs ON gs.lecture_group_id = lg.id
    WHERE lgs.student_user_id = p_student_user_id
      AND public.teacher_can_access_lecture_group(lg.id)
      AND ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time' AND gs.class_date = v_date))
    UNION ALL
    SELECT pg.id, 'personal'::text, pg.name, gs.id,
      to_char(gs.start_time, 'HH24:MI'), to_char(gs.end_time, 'HH24:MI'), gs.kind::text, 0
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    INNER JOIN public.group_schedules gs ON gs.teacher_personal_group_id = pg.id
    WHERE r.student_user_id = p_student_user_id AND public.teacher_owns_personal_group(pg.id)
      AND ((gs.kind = 'recurring_weekly' AND gs.schedule_year = v_year AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time' AND gs.class_date = v_date))
  ),
  fallback_slots AS (
    SELECT lg.id, 'institute'::text, lg.name, gs.id,
      to_char(gs.start_time, 'HH24:MI'), to_char(gs.end_time, 'HH24:MI'), gs.kind::text, 1
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups lg ON lg.id = lgs.lecture_group_id
    INNER JOIN public.group_schedules gs ON gs.lecture_group_id = lg.id
    WHERE lgs.student_user_id = p_student_user_id
      AND public.teacher_can_access_lecture_group(lg.id)
    UNION ALL
    SELECT pg.id, 'personal'::text, pg.name, gs.id,
      to_char(gs.start_time, 'HH24:MI'), to_char(gs.end_time, 'HH24:MI'), gs.kind::text, 1
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    INNER JOIN public.group_schedules gs ON gs.teacher_personal_group_id = pg.id
    WHERE r.student_user_id = p_student_user_id AND public.teacher_owns_personal_group(pg.id)
  ),
  combined AS (
    SELECT * FROM today_slots
    UNION ALL
    SELECT f.* FROM fallback_slots f
    WHERE NOT EXISTS (SELECT 1 FROM today_slots)
  )
  SELECT c.gid, c.gsrc, c.gname, c.sid, c.st, c.et, c.knd
  FROM combined c
  ORDER BY c.ord, c.st;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_notifications(p_limit int DEFAULT 30)
RETURNS TABLE (
  id         uuid,
  title      text,
  body       text,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.title, n.body, n.data, n.read_at, n.created_at
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100));
$$;

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.notifications n
  WHERE n.user_id = auth.uid() AND n.read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notification_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF p_notification_ids IS NULL OR array_length(p_notification_ids, 1) IS NULL THEN
    UPDATE public.notifications SET read_at = now()
    WHERE user_id = v_user AND read_at IS NULL;
  ELSE
    UPDATE public.notifications SET read_at = now()
    WHERE user_id = v_user AND id = ANY(p_notification_ids) AND read_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'marked', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_mark_attendance_by_scan(uuid, date, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_mark_attendance_by_scan(uuid, date, text, uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_list_scan_attendance_options(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_list_scan_attendance_options(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_notifications(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(int) TO authenticated;

REVOKE ALL ON FUNCTION public.count_unread_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
