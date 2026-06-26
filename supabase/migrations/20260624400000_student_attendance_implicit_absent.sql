-- Past scheduled class days without a Present mark count as Absent (not "no data").
-- Today is only counted when the teacher has recorded a mark for that day.

CREATE OR REPLACE FUNCTION public.student_attendance_days_for_group(
  p_student_user_id   uuid,
  p_lecture_group_id  uuid,
  p_group_source      text,
  v_start             date,
  v_end               date
)
RETURNS TABLE (
  class_date date,
  present    boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  RETURN QUERY
  WITH class_days AS (
    SELECT DISTINCT g.d::date AS class_date
    FROM generate_series(v_start, v_end, interval '1 day') AS g(d)
    INNER JOIN public.group_schedules gs ON (
      (v_source = 'institute' AND gs.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_lecture_group_id)
    )
    WHERE (
      (
        gs.kind = 'recurring_weekly'::public.group_schedule_kind
        AND gs.day_of_week = EXTRACT(DOW FROM g.d)::int
      )
      OR (
        gs.kind = 'one_time'::public.group_schedule_kind
        AND gs.class_date = g.d::date
      )
    )
    UNION
    SELECT s.session_date
    FROM public.group_attendance_sessions s
    WHERE (
      (v_source = 'institute' AND s.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND s.teacher_personal_group_id = p_lecture_group_id)
    )
      AND s.session_date >= v_start
      AND s.session_date <= v_end
  ),
  day_marks AS (
    SELECT
      cd.class_date,
      (
        SELECT m.present
        FROM public.group_attendance_sessions s
        INNER JOIN public.group_attendance_marks m ON m.session_id = s.id
        WHERE s.session_date = cd.class_date
          AND (
            (v_source = 'institute' AND s.lecture_group_id = p_lecture_group_id)
            OR (v_source = 'personal' AND s.teacher_personal_group_id = p_lecture_group_id)
          )
          AND (
            (v_source = 'institute' AND m.student_user_id = p_student_user_id)
            OR (
              v_source = 'personal'
              AND (
                m.student_user_id = p_student_user_id
                OR EXISTS (
                  SELECT 1
                  FROM public.teacher_personal_roster_entries r
                  WHERE r.id = m.personal_roster_id
                    AND r.student_user_id = p_student_user_id
                    AND r.teacher_personal_group_id = p_lecture_group_id
                )
              )
            )
          )
        ORDER BY m.recorded_at DESC
        LIMIT 1
      ) AS marked_present
    FROM class_days cd
  )
  SELECT
    dm.class_date,
    COALESCE(dm.marked_present, false) AS present
  FROM day_marks dm
  WHERE dm.class_date < v_end
     OR dm.marked_present IS NOT NULL;
END;
$$;

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
      COALESCE(stats.total_sessions, 0)::int AS total_sessions,
      COALESCE(stats.present_count, 0)::int AS present_count,
      COALESCE(stats.absent_count, 0)::int AS absent_count
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE d.present)::int AS present_count,
        COUNT(*) FILTER (WHERE NOT d.present)::int AS absent_count
      FROM public.student_attendance_days_for_group(
        p_student_user_id,
        g.id,
        'institute',
        v_start,
        v_end
      ) d
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
        COUNT(*) FILTER (WHERE d.present)::int AS present_count,
        COUNT(*) FILTER (WHERE NOT d.present)::int AS absent_count
      FROM public.student_attendance_days_for_group(
        p_student_user_id,
        pg.id,
        'personal',
        v_start,
        v_end
      ) d
    ) stats ON true
    WHERE r.student_user_id = p_student_user_id
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_group_calendar(uuid, uuid, text, int, date);

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
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.lecture_group_students
      WHERE student_user_id = p_student_user_id
        AND lecture_group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'not_enrolled';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    d.class_date::text AS session_date,
    d.present
  FROM public.student_attendance_days_for_group(
    p_student_user_id,
    p_group_id,
    v_source,
    v_start,
    v_end
  ) d
  ORDER BY d.class_date;
END;
$$;

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
    COUNT(*) FILTER (WHERE d.present)::int
  INTO v_total, v_present
  FROM (
    SELECT ad.present
    FROM public.lecture_group_students lgs
    CROSS JOIN LATERAL public.student_attendance_days_for_group(
      p_student_user_id,
      lgs.lecture_group_id,
      'institute',
      v_start,
      v_end
    ) ad
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    SELECT ad.present
    FROM public.teacher_personal_roster_entries r
    CROSS JOIN LATERAL public.student_attendance_days_for_group(
      p_student_user_id,
      r.teacher_personal_group_id,
      'personal',
      v_start,
      v_end
    ) ad
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

REVOKE ALL ON FUNCTION public.student_attendance_days_for_group(uuid, uuid, text, date, date) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.student_attendance_by_group(uuid, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_by_group(uuid, int, date) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
