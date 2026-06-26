-- Attendance: list every enrolled group (institute + personal), same enrollment set as Classes tab.

DROP FUNCTION IF EXISTS public.student_attendance_by_group(uuid, int, date);

CREATE OR REPLACE FUNCTION public.student_attendance_by_group(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30,
  p_local_date      date DEFAULT NULL
)
RETURNS TABLE (
  lecture_group_id uuid,
  group_source     text,
  group_name       text,
  institute_name   text,
  total_sessions   int,
  present_count    int,
  absent_count     int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_window int  := GREATEST(LEAST(COALESCE(p_window_days, 30), 30), 7);
  v_end    date := COALESCE(p_local_date, CURRENT_DATE);
  v_start  date := v_end - (v_window - 1);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      g.id AS lecture_group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(i.name, '')::text AS institute_name,
      COUNT(m.id)::int AS total_sessions,
      COUNT(m.id) FILTER (WHERE m.present)::int AS present_count,
      COUNT(m.id) FILTER (WHERE NOT m.present)::int AS absent_count
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.group_attendance_sessions s
      ON s.lecture_group_id = g.id
     AND s.session_date >= v_start
     AND s.session_date <= v_end
    LEFT JOIN public.group_attendance_marks m
      ON m.session_id = s.id
     AND m.student_user_id = p_student_user_id
    WHERE lgs.student_user_id = p_student_user_id
    GROUP BY g.id, g.name, i.name

    UNION ALL

    SELECT
      pg.id AS lecture_group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
      COUNT(m.id)::int AS total_sessions,
      COUNT(m.id) FILTER (WHERE m.present)::int AS present_count,
      COUNT(m.id) FILTER (WHERE NOT m.present)::int AS absent_count
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    LEFT JOIN public.group_attendance_sessions s
      ON s.teacher_personal_group_id = pg.id
     AND s.session_date >= v_start
     AND s.session_date <= v_end
    LEFT JOIN public.group_attendance_marks m
      ON m.session_id = s.id
     AND (
       m.student_user_id = p_student_user_id
       OR m.personal_roster_id = r.id
     )
    WHERE r.student_user_id = p_student_user_id
    GROUP BY pg.id, pg.name, tp.full_name, tp.first_name, tp.last_name
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_group_calendar(uuid, uuid, int, date);

CREATE OR REPLACE FUNCTION public.student_attendance_group_calendar(
  p_student_user_id   uuid,
  p_group_id          uuid,
  p_group_source      text DEFAULT 'institute',
  p_window_days       int DEFAULT 30,
  p_local_date        date DEFAULT NULL
)
RETURNS TABLE (
  session_date text,
  present      boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_window int  := GREATEST(LEAST(COALESCE(p_window_days, 30), 30), 7);
  v_end    date := COALESCE(p_local_date, CURRENT_DATE);
  v_start  date := v_end - (v_window - 1);
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_source = 'personal' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.teacher_personal_roster_entries r
      WHERE r.student_user_id = p_student_user_id
        AND r.teacher_personal_group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'not_enrolled';
    END IF;

    RETURN QUERY
    SELECT
      s.session_date::text AS session_date,
      m.present
    FROM public.group_attendance_marks m
    INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
    INNER JOIN public.teacher_personal_roster_entries r
      ON r.teacher_personal_group_id = s.teacher_personal_group_id
     AND r.student_user_id = p_student_user_id
    WHERE s.teacher_personal_group_id = p_group_id
      AND s.session_date >= v_start
      AND s.session_date <= v_end
      AND (
        m.student_user_id = p_student_user_id
        OR m.personal_roster_id = r.id
      )
    ORDER BY s.session_date;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.lecture_group_students
      WHERE student_user_id = p_student_user_id
        AND lecture_group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'not_enrolled';
    END IF;

    RETURN QUERY
    SELECT
      s.session_date::text AS session_date,
      m.present
    FROM public.group_attendance_marks m
    INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
    WHERE m.student_user_id = p_student_user_id
      AND s.lecture_group_id = p_group_id
      AND s.session_date >= v_start
      AND s.session_date <= v_end
    ORDER BY s.session_date;
  END IF;
END;
$$;

-- Summary: use parent_may_view_student (includes personal-group marks via student_user_id)
DROP FUNCTION IF EXISTS public.student_attendance_summary(uuid, int, date);

CREATE OR REPLACE FUNCTION public.student_attendance_summary(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30,
  p_local_date      date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_total   int  := 0;
  v_present int  := 0;
  v_window  int  := GREATEST(LEAST(COALESCE(p_window_days, 30), 30), 7);
  v_end     date := COALESCE(p_local_date, CURRENT_DATE);
  v_start   date := v_end - (v_window - 1);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE m.present)::int
  INTO v_total, v_present
  FROM public.group_attendance_marks m
  INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
  WHERE (
      m.student_user_id = p_student_user_id
      OR EXISTS (
        SELECT 1
        FROM public.teacher_personal_roster_entries r
        WHERE r.id = m.personal_roster_id
          AND r.student_user_id = p_student_user_id
      )
    )
    AND s.session_date >= v_start
    AND s.session_date <= v_end;

  RETURN jsonb_build_object(
    'total',       v_total,
    'present',     v_present,
    'absent',      GREATEST(v_total - v_present, 0),
    'percentage',  CASE WHEN v_total = 0 THEN NULL
                        ELSE round((v_present * 100.0 / v_total)::numeric, 1) END,
    'window_days', v_window
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_attendance_by_group(uuid, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_by_group(uuid, int, date) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
