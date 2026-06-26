-- Ensure one-time (extra) class days appear on the parent attendance calendar.

CREATE OR REPLACE FUNCTION public.student_attendance_days_for_group(
  p_student_user_id   uuid,
  p_lecture_group_id  uuid,
  p_group_source      text,
  v_start             date,
  v_end               date,
  p_local_time        time DEFAULT NULL
)
RETURNS TABLE (
  class_date date,
  present    boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_time   time := COALESCE(p_local_time, LOCALTIME);
BEGIN
  RETURN QUERY
  WITH schedule_occurrences AS (
    -- Recurring weekly slots for the matching calendar year
    SELECT
      ser.d::date AS class_date,
      gs.end_time,
      gs.id AS schedule_id,
      'recurring'::text AS occurrence_kind
    FROM generate_series(v_start, v_end, interval '1 day') AS ser(d)
    INNER JOIN public.group_schedules gs ON (
      (v_source = 'institute' AND gs.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_lecture_group_id)
    )
    WHERE gs.kind = 'recurring_weekly'::public.group_schedule_kind
      AND gs.schedule_year = EXTRACT(YEAR FROM ser.d)::int
      AND gs.day_of_week = EXTRACT(DOW FROM ser.d)::int

    UNION ALL

    -- Extra (one-time) classes in the rolling window
    SELECT
      gs.class_date,
      gs.end_time,
      gs.id,
      'one_time'::text
    FROM public.group_schedules gs
    WHERE (
      (v_source = 'institute' AND gs.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_lecture_group_id)
    )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND gs.class_date >= v_start
      AND gs.class_date <= v_end

    UNION ALL

    -- Teacher-opened attendance sessions (covers extras even if schedule row was removed)
    SELECT
      s.session_date,
      COALESCE(
        (
          SELECT gs2.end_time
          FROM public.group_schedules gs2
          WHERE (
            (v_source = 'institute' AND gs2.lecture_group_id = p_lecture_group_id)
            OR (v_source = 'personal' AND gs2.teacher_personal_group_id = p_lecture_group_id)
          )
            AND (
              (
                gs2.kind = 'recurring_weekly'::public.group_schedule_kind
                AND gs2.schedule_year = EXTRACT(YEAR FROM s.session_date)::int
                AND gs2.day_of_week = EXTRACT(DOW FROM s.session_date)::int
              )
              OR (
                gs2.kind = 'one_time'::public.group_schedule_kind
                AND gs2.class_date = s.session_date
              )
            )
          ORDER BY
            CASE WHEN gs2.kind = 'one_time'::public.group_schedule_kind THEN 0 ELSE 1 END,
            gs2.end_time DESC
          LIMIT 1
        ),
        TIME '23:59:59'
      ) AS end_time,
      NULL::uuid AS schedule_id,
      'session'::text
    FROM public.group_attendance_sessions s
    WHERE (
      (v_source = 'institute' AND s.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND s.teacher_personal_group_id = p_lecture_group_id)
    )
      AND s.session_date >= v_start
      AND s.session_date <= v_end
  ),
  occurrence_rows AS (
    SELECT
      so.class_date,
      so.end_time,
      so.schedule_id,
      so.occurrence_kind,
      (
        SELECT m.present
        FROM public.group_attendance_sessions s
        INNER JOIN public.group_attendance_marks m ON m.session_id = s.id
        WHERE s.session_date = so.class_date
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
    FROM schedule_occurrences so
  ),
  eligible AS (
    SELECT
      o.class_date,
      o.end_time,
      o.schedule_id,
      o.occurrence_kind,
      o.marked_present,
      (
        o.class_date < v_end
        OR (o.class_date = v_end AND o.end_time <= v_time)
        OR o.marked_present IS NOT NULL
      ) AS is_eligible
    FROM occurrence_rows o
  )
  SELECT
    e.class_date,
    COALESCE(e.marked_present, false) AS present
  FROM eligible e
  WHERE e.is_eligible;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_attendance_group_calendar(
  p_student_user_id   uuid,
  p_group_id          uuid,
  p_group_source      text DEFAULT 'institute',
  p_window_days       int DEFAULT 30,
  p_local_date        date DEFAULT NULL,
  p_local_time        time DEFAULT NULL
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
  v_time   time := COALESCE(p_local_time, LOCALTIME);
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
  WITH occurrence_days AS (
    SELECT
      d.class_date,
      d.present
    FROM public.student_attendance_days_for_group(
      p_student_user_id,
      p_group_id,
      v_source,
      v_start,
      v_end,
      p_local_time
    ) d
  ),
  extra_schedule_days AS (
    SELECT
      gs.class_date,
      false AS present
    FROM public.group_schedules gs
    WHERE (
      (v_source = 'institute' AND gs.lecture_group_id = p_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_group_id)
    )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND gs.class_date >= v_start
      AND gs.class_date <= v_end
      AND (
        gs.class_date < v_end
        OR (gs.class_date = v_end AND gs.end_time <= v_time)
      )
  ),
  all_days AS (
    SELECT class_date, present FROM occurrence_days
    UNION ALL
    SELECT e.class_date, e.present
    FROM extra_schedule_days e
    WHERE NOT EXISTS (
      SELECT 1
      FROM occurrence_days o
      WHERE o.class_date = e.class_date
    )
  ),
  by_date AS (
    SELECT
      ad.class_date,
      BOOL_OR(ad.present) AS any_present,
      COUNT(*)::int AS row_count
    FROM all_days ad
    GROUP BY ad.class_date
  )
  SELECT
    bd.class_date::text AS session_date,
    CASE
      WHEN bd.any_present THEN true
      WHEN bd.row_count > 0 THEN false
      ELSE false
    END AS present
  FROM by_date bd
  ORDER BY bd.class_date;
END;
$$;

NOTIFY pgrst, 'reload schema';
