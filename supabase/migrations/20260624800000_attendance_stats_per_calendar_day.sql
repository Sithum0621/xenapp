-- Align absence totals with the calendar: count one result per calendar day per class
-- (the calendar shows one cell per day; multiple weekly slots on the same day are merged).

DROP FUNCTION IF EXISTS public.student_attendance_by_group(uuid, int, date, time);

CREATE OR REPLACE FUNCTION public.student_attendance_by_group(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30,
  p_local_date      date DEFAULT NULL,
  p_local_time      time DEFAULT NULL
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
      COALESCE(stats.total_sessions, 0)::int AS total_sessions,
      COALESCE(stats.present_count, 0)::int AS present_count,
      COALESCE(stats.absent_count, 0)::int AS absent_count
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE per_day.day_present)::int AS present_count,
        COUNT(*) FILTER (WHERE NOT per_day.day_present)::int AS absent_count
      FROM (
        SELECT
          d.class_date,
          BOOL_OR(d.present) AS day_present
        FROM public.student_attendance_days_for_group(
          p_student_user_id,
          g.id,
          'institute',
          v_start,
          v_end,
          p_local_time
        ) d
        GROUP BY d.class_date
      ) per_day
    ) stats ON true
    WHERE lgs.student_user_id = p_student_user_id

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
      COALESCE(stats.total_sessions, 0)::int AS total_sessions,
      COALESCE(stats.present_count, 0)::int AS present_count,
      COALESCE(stats.absent_count, 0)::int AS absent_count
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE per_day.day_present)::int AS present_count,
        COUNT(*) FILTER (WHERE NOT per_day.day_present)::int AS absent_count
      FROM (
        SELECT
          d.class_date,
          BOOL_OR(d.present) AS day_present
        FROM public.student_attendance_days_for_group(
          p_student_user_id,
          pg.id,
          'personal',
          v_start,
          v_end,
          p_local_time
        ) d
        GROUP BY d.class_date
      ) per_day
    ) stats ON true
    WHERE r.student_user_id = p_student_user_id
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_summary(uuid, int, date, time);

CREATE OR REPLACE FUNCTION public.student_attendance_summary(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30,
  p_local_date      date DEFAULT NULL,
  p_local_time      time DEFAULT NULL
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
    COUNT(*) FILTER (WHERE d.day_present)::int
  INTO v_total, v_present
  FROM (
    SELECT
      per_day.day_present
    FROM public.lecture_group_students lgs
    CROSS JOIN LATERAL (
      SELECT
        ad.class_date,
        BOOL_OR(ad.present) AS day_present
      FROM public.student_attendance_days_for_group(
        p_student_user_id,
        lgs.lecture_group_id,
        'institute',
        v_start,
        v_end,
        p_local_time
      ) ad
      GROUP BY ad.class_date
    ) per_day
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    SELECT
      per_day.day_present
    FROM public.teacher_personal_roster_entries r
    CROSS JOIN LATERAL (
      SELECT
        ad.class_date,
        BOOL_OR(ad.present) AS day_present
      FROM public.student_attendance_days_for_group(
        p_student_user_id,
        r.teacher_personal_group_id,
        'personal',
        v_start,
        v_end,
        p_local_time
      ) ad
      GROUP BY ad.class_date
    ) per_day
    WHERE r.student_user_id = p_student_user_id
  ) d;

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

REVOKE ALL ON FUNCTION public.student_attendance_by_group(uuid, int, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_by_group(uuid, int, date, time) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int, date, time) TO authenticated;

NOTIFY pgrst, 'reload schema';
