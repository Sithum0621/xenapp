-- Institute admin dashboard: stats, today's schedule, activity feed, growth chart.

CREATE OR REPLACE FUNCTION public.institute_admin_today_schedule_slots(
  p_institute_id uuid,
  p_session_date date
)
RETURNS TABLE (
  schedule_id uuid,
  lecture_group_id uuid,
  group_name text,
  teacher_name text,
  start_time time,
  end_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gs.id AS schedule_id,
    g.id AS lecture_group_id,
    g.name::text AS group_name,
    COALESCE(NULLIF(trim(tp.full_name), ''), '—')::text AS teacher_name,
    gs.start_time,
    gs.end_time
  FROM public.lecture_groups g
  INNER JOIN public.group_schedules gs ON gs.lecture_group_id = g.id
  LEFT JOIN public.profiles tp ON tp.id = g.primary_teacher_user_id
  WHERE g.institute_id = p_institute_id
    AND (
      (
        gs.kind = 'recurring_weekly'::public.group_schedule_kind
        AND gs.schedule_year = EXTRACT(YEAR FROM p_session_date)::int
        AND gs.day_of_week = EXTRACT(DOW FROM p_session_date)::int
      )
      OR (
        gs.kind = 'one_time'::public.group_schedule_kind
        AND gs.class_date = p_session_date
      )
    )
  ORDER BY gs.start_time, g.name;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_today_schedule_slots(uuid, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.institute_admin_dashboard_stats(
  p_session_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_active_students int := 0;
  v_todays_classes int := 0;
  v_pending_tasks int := 0;
  v_attendance_pct numeric := 0;
  v_expected_marks int := 0;
  v_present_marks int := 0;
  v_groups_no_teacher int := 0;
  v_incomplete_slots int := 0;
BEGIN
  v_inst := public.institute_admin_require_institute();

  SELECT count(*)::int
  INTO v_todays_classes
  FROM public.institute_admin_today_schedule_slots(v_inst, p_session_date);

  SELECT count(DISTINCT m.student_user_id)::int
  INTO v_active_students
  FROM public.group_attendance_marks m
  INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
  INNER JOIN public.lecture_groups g ON g.id = s.lecture_group_id
  WHERE g.institute_id = v_inst
    AND s.session_date = p_session_date
    AND m.present = true
    AND m.student_user_id IS NOT NULL;

  SELECT count(*)::int
  INTO v_groups_no_teacher
  FROM public.lecture_groups g
  WHERE g.institute_id = v_inst
    AND g.primary_teacher_user_id IS NULL;

  WITH slots AS (
    SELECT * FROM public.institute_admin_today_schedule_slots(v_inst, p_session_date)
  ),
  slot_stats AS (
    SELECT
      sl.schedule_id,
      sl.lecture_group_id,
      COALESCE(enrolled.cnt, 0)::int AS enrolled_count,
      COALESCE(sess.present_count, 0)::int AS present_count,
      COALESCE(sess.marked_count, 0)::int AS marked_count
    FROM slots sl
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM public.lecture_group_students lgs
      WHERE lgs.lecture_group_id = sl.lecture_group_id
    ) enrolled ON true
    LEFT JOIN LATERAL (
      SELECT
        s.id AS session_id,
        count(m.*)::int AS marked_count,
        count(m.*) FILTER (WHERE m.present)::int AS present_count
      FROM public.group_attendance_sessions s
      LEFT JOIN public.group_attendance_marks m ON m.session_id = s.id
      WHERE s.lecture_group_id = sl.lecture_group_id
        AND s.session_date = p_session_date
        AND s.schedule_id = sl.schedule_id
      GROUP BY s.id
    ) sess ON true
  )
  SELECT
    coalesce(sum(enrolled_count), 0)::int,
    coalesce(sum(present_count), 0)::int,
    count(*) FILTER (
      WHERE enrolled_count > 0
        AND (marked_count IS NULL OR marked_count < enrolled_count)
    )::int
  INTO v_expected_marks, v_present_marks, v_incomplete_slots
  FROM slot_stats;

  v_pending_tasks := coalesce(v_incomplete_slots, 0) + coalesce(v_groups_no_teacher, 0);

  IF coalesce(v_expected_marks, 0) > 0 THEN
    v_attendance_pct := round((v_present_marks::numeric / v_expected_marks) * 100, 1);
  ELSE
    v_attendance_pct := 0;
  END IF;

  RETURN jsonb_build_object(
    'active_students_today', coalesce(v_active_students, 0),
    'todays_classes', coalesce(v_todays_classes, 0),
    'pending_tasks', coalesce(v_pending_tasks, 0),
    'attendance_pct_today', v_attendance_pct,
    'session_date', p_session_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_dashboard_stats(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_dashboard_stats(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_dashboard_today_schedule(
  p_session_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_items jsonb;
BEGIN
  v_inst := public.institute_admin_require_institute();

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'schedule_id', x.schedule_id,
      'lecture_group_id', x.lecture_group_id,
      'group_name', x.group_name,
      'teacher_name', x.teacher_name,
      'start_time', x.start_time,
      'end_time', x.end_time,
      'enrolled_count', x.enrolled_count,
      'present_count', x.present_count,
      'marked_count', x.marked_count,
      'attendance_complete', x.attendance_complete
    )
    ORDER BY x.sort_start, x.group_name
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      sl.schedule_id,
      sl.lecture_group_id,
      sl.group_name,
      sl.teacher_name,
      to_char(sl.start_time, 'HH24:MI') AS start_time,
      to_char(sl.end_time, 'HH24:MI') AS end_time,
      sl.start_time AS sort_start,
      coalesce(enrolled.cnt, 0)::int AS enrolled_count,
      coalesce(sess.present_count, 0)::int AS present_count,
      coalesce(sess.marked_count, 0)::int AS marked_count,
      (
        coalesce(enrolled.cnt, 0) > 0
        AND coalesce(sess.marked_count, 0) >= coalesce(enrolled.cnt, 0)
      ) AS attendance_complete
    FROM public.institute_admin_today_schedule_slots(v_inst, p_session_date) sl
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM public.lecture_group_students lgs
      WHERE lgs.lecture_group_id = sl.lecture_group_id
    ) enrolled ON true
    LEFT JOIN LATERAL (
      SELECT
        count(m.*)::int AS marked_count,
        count(m.*) FILTER (WHERE m.present)::int AS present_count
      FROM public.group_attendance_sessions s
      LEFT JOIN public.group_attendance_marks m ON m.session_id = s.id
      WHERE s.lecture_group_id = sl.lecture_group_id
        AND s.session_date = p_session_date
        AND s.schedule_id = sl.schedule_id
    ) sess ON true
  ) x;

  RETURN jsonb_build_object(
    'session_date', p_session_date,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_dashboard_today_schedule(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_dashboard_today_schedule(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_dashboard_activity(
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_items jsonb;
BEGIN
  v_inst := public.institute_admin_require_institute();

  SELECT coalesce(
    (
      SELECT jsonb_agg(lim.ev ORDER BY (lim.ev->>'occurred_at')::timestamptz DESC)
      FROM (
        SELECT combined.ev
        FROM (
          SELECT jsonb_build_object(
            'kind', 'student_registered',
            'occurred_at', m.created_at,
            'title', COALESCE(NULLIF(trim(p.full_name), ''), u.email),
            'subtitle', 'New student joined the institute',
            'lecture_group_id', NULL,
            'user_id', p.id
          ) AS ev
          FROM public.institute_student_membership m
          INNER JOIN public.profiles p ON p.id = m.user_id
          INNER JOIN auth.users u ON u.id = p.id
          WHERE m.institute_id = v_inst
            AND m.created_at >= now() - interval '30 days'

          UNION ALL

          SELECT jsonb_build_object(
            'kind', 'student_enrolled_group',
            'occurred_at', lgs.created_at,
            'title', COALESCE(NULLIF(trim(sp.full_name), ''), su.email),
            'subtitle', 'Enrolled in ' || g.name,
            'lecture_group_id', g.id,
            'user_id', sp.id
          )
          FROM public.lecture_group_students lgs
          INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
          INNER JOIN public.profiles sp ON sp.id = lgs.student_user_id
          INNER JOIN auth.users su ON su.id = sp.id
          WHERE g.institute_id = v_inst
            AND lgs.created_at >= now() - interval '30 days'

          UNION ALL

          SELECT jsonb_build_object(
            'kind', 'teacher_assigned',
            'occurred_at', tm.created_at,
            'title', COALESCE(NULLIF(trim(tp.full_name), ''), tu.email),
            'subtitle', 'Teacher joined the institute',
            'lecture_group_id', NULL,
            'user_id', tp.id
          )
          FROM public.institute_teacher_membership tm
          INNER JOIN public.profiles tp ON tp.id = tm.user_id
          INNER JOIN auth.users tu ON tu.id = tp.id
          WHERE tm.institute_id = v_inst
            AND tm.created_at >= now() - interval '30 days'

          UNION ALL

          SELECT jsonb_build_object(
            'kind', 'attendance_marked',
            'occurred_at', m.recorded_at,
            'title', g.name,
            'subtitle',
              COALESCE(NULLIF(trim(sp.full_name), ''), 'Student')
              || CASE WHEN m.present THEN ' marked present' ELSE ' marked absent' END,
            'lecture_group_id', g.id,
            'user_id', m.student_user_id
          )
          FROM public.group_attendance_marks m
          INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
          INNER JOIN public.lecture_groups g ON g.id = s.lecture_group_id
          LEFT JOIN public.profiles sp ON sp.id = m.student_user_id
          WHERE g.institute_id = v_inst
            AND m.recorded_at >= now() - interval '14 days'
            AND m.student_user_id IS NOT NULL
        ) combined
        ORDER BY (combined.ev->>'occurred_at')::timestamptz DESC
        LIMIT v_limit
      ) lim
    ),
    '[]'::jsonb
  )
  INTO v_items;

  RETURN jsonb_build_object('items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_dashboard_activity(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_dashboard_activity(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_dashboard_growth(
  p_period text DEFAULT 'week'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_period text;
  v_labels text[];
  v_enrollments int[];
  v_attendance_pct numeric[];
  r record;
BEGIN
  v_inst := public.institute_admin_require_institute();
  v_period := lower(trim(coalesce(p_period, 'week')));
  IF v_period NOT IN ('week', 'month') THEN
    v_period := 'week';
  END IF;

  v_labels := ARRAY[]::text[];
  v_enrollments := ARRAY[]::int[];
  v_attendance_pct := ARRAY[]::numeric[];

  IF v_period = 'week' THEN
    FOR r IN
      WITH buckets AS (
        SELECT
          gs::date AS bucket_date,
          to_char(gs::date, 'Dy') AS bucket_label
        FROM generate_series(
          (CURRENT_DATE - interval '6 days')::date,
          CURRENT_DATE,
          interval '1 day'
        ) AS gs
      )
      SELECT
        b.bucket_label,
        coalesce((
          SELECT count(*)::int
          FROM public.institute_student_membership m
          WHERE m.institute_id = v_inst
            AND (m.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS enrollments,
        coalesce((
          WITH slots AS (
            SELECT * FROM public.institute_admin_today_schedule_slots(v_inst, b.bucket_date)
          ),
          slot_stats AS (
            SELECT
              coalesce(en.cnt, 0)::int AS enrolled_count,
              coalesce(sess.present_count, 0)::int AS present_count
            FROM slots sl
            LEFT JOIN LATERAL (
              SELECT count(*)::int AS cnt
              FROM public.lecture_group_students lgs
              WHERE lgs.lecture_group_id = sl.lecture_group_id
            ) en ON true
            LEFT JOIN LATERAL (
              SELECT count(m.*) FILTER (WHERE m.present)::int AS present_count
              FROM public.group_attendance_sessions s
              LEFT JOIN public.group_attendance_marks m ON m.session_id = s.id
              WHERE s.lecture_group_id = sl.lecture_group_id
                AND s.session_date = b.bucket_date
                AND s.schedule_id = sl.schedule_id
            ) sess ON true
          )
          SELECT CASE
            WHEN coalesce(sum(enrolled_count), 0) <= 0 THEN 0::numeric
            ELSE round((sum(present_count)::numeric / sum(enrolled_count)) * 100, 1)
          END
          FROM slot_stats
        ), 0::numeric) AS attendance_pct
      FROM buckets b
      ORDER BY b.bucket_date
    LOOP
      v_labels := array_append(v_labels, r.bucket_label);
      v_enrollments := array_append(v_enrollments, r.enrollments);
      v_attendance_pct := array_append(v_attendance_pct, r.attendance_pct);
    END LOOP;
  ELSE
    FOR r IN
      WITH buckets AS (
        SELECT
          gs::date AS bucket_date,
          to_char(gs::date, 'DD Mon') AS bucket_label
        FROM generate_series(
          date_trunc('month', CURRENT_DATE)::date,
          CURRENT_DATE,
          interval '1 day'
        ) AS gs
      )
      SELECT
        b.bucket_label,
        coalesce((
          SELECT count(*)::int
          FROM public.institute_student_membership m
          WHERE m.institute_id = v_inst
            AND (m.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS enrollments,
        coalesce((
          WITH slots AS (
            SELECT * FROM public.institute_admin_today_schedule_slots(v_inst, b.bucket_date)
          ),
          slot_stats AS (
            SELECT
              coalesce(en.cnt, 0)::int AS enrolled_count,
              coalesce(sess.present_count, 0)::int AS present_count
            FROM slots sl
            LEFT JOIN LATERAL (
              SELECT count(*)::int AS cnt
              FROM public.lecture_group_students lgs
              WHERE lgs.lecture_group_id = sl.lecture_group_id
            ) en ON true
            LEFT JOIN LATERAL (
              SELECT count(m.*) FILTER (WHERE m.present)::int AS present_count
              FROM public.group_attendance_sessions s
              LEFT JOIN public.group_attendance_marks m ON m.session_id = s.id
              WHERE s.lecture_group_id = sl.lecture_group_id
                AND s.session_date = b.bucket_date
                AND s.schedule_id = sl.schedule_id
            ) sess ON true
          )
          SELECT CASE
            WHEN coalesce(sum(enrolled_count), 0) <= 0 THEN 0::numeric
            ELSE round((sum(present_count)::numeric / sum(enrolled_count)) * 100, 1)
          END
          FROM slot_stats
        ), 0::numeric) AS attendance_pct
      FROM buckets b
      ORDER BY b.bucket_date
    LOOP
      v_labels := array_append(v_labels, r.bucket_label);
      v_enrollments := array_append(v_enrollments, r.enrollments);
      v_attendance_pct := array_append(v_attendance_pct, r.attendance_pct);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'period', v_period,
    'labels', to_jsonb(v_labels),
    'enrollments', to_jsonb(v_enrollments),
    'attendance_pct', to_jsonb(v_attendance_pct)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_dashboard_growth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_dashboard_growth(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
