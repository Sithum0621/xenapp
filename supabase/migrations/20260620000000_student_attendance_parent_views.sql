-- Parent/student attendance: per-group breakdown + calendar marks (last N days).

DROP FUNCTION IF EXISTS public.student_attendance_summary(uuid, int);

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
  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE m.present)::int
  INTO v_total, v_present
  FROM public.group_attendance_marks m
  INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
  WHERE m.student_user_id = p_student_user_id
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

CREATE OR REPLACE FUNCTION public.student_attendance_by_group(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30,
  p_local_date      date DEFAULT NULL
)
RETURNS TABLE (
  lecture_group_id uuid,
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
  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT
    g.id AS lecture_group_id,
    g.name::text AS group_name,
    COALESCE(i.name, '')::text AS institute_name,
    COUNT(m.id)::int AS total_sessions,
    COUNT(m.id) FILTER (WHERE m.present)::int AS present_count,
    COUNT(m.id) FILTER (WHERE NOT m.present)::int AS absent_count
  FROM public.lecture_group_students lgs
  INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
  INNER JOIN public.institutes i ON i.id = g.institute_id
  LEFT JOIN public.group_attendance_sessions s
    ON s.lecture_group_id = g.id
   AND s.session_date >= v_start
   AND s.session_date <= v_end
  LEFT JOIN public.group_attendance_marks m
    ON m.session_id = s.id
   AND m.student_user_id = p_student_user_id
  WHERE lgs.student_user_id = p_student_user_id
  GROUP BY g.id, g.name, i.name
  ORDER BY lower(g.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_attendance_group_calendar(
  p_student_user_id   uuid,
  p_lecture_group_id  uuid,
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lecture_group_students
    WHERE student_user_id = p_student_user_id
      AND lecture_group_id = p_lecture_group_id
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
    AND s.lecture_group_id = p_lecture_group_id
    AND s.session_date >= v_start
    AND s.session_date <= v_end
  ORDER BY s.session_date;
END;
$$;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_attendance_by_group(uuid, int, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, int, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_attendance_by_group(uuid, int, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, int, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
