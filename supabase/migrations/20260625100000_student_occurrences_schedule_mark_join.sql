-- Match attendance marks to the correct schedule slot (weekly or extra class).

CREATE OR REPLACE FUNCTION public.student_attendance_group_occurrences(
  p_student_user_id   uuid,
  p_group_id          uuid,
  p_group_source      text DEFAULT 'institute',
  p_window_days       int DEFAULT 30,
  p_local_date        date DEFAULT NULL,
  p_local_time        time DEFAULT NULL
)
RETURNS TABLE (
  class_date        date,
  start_time        text,
  end_time          text,
  occurrence_kind   text,
  is_present        boolean,
  recorded_at       timestamptz,
  has_mark          boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
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
  WITH schedule_occurrences AS (
    SELECT
      ser.d::date AS class_date,
      gs.start_time,
      gs.end_time,
      gs.id AS schedule_id,
      gs.kind::text AS schedule_kind
    FROM generate_series(v_start, v_end, interval '1 day') AS ser(d)
    INNER JOIN public.group_schedules gs ON (
      (v_source = 'institute' AND gs.lecture_group_id = p_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_group_id)
    )
    WHERE gs.kind = 'recurring_weekly'::public.group_schedule_kind
      AND gs.schedule_year = EXTRACT(YEAR FROM ser.d)::int
      AND gs.day_of_week = EXTRACT(DOW FROM ser.d)::int

    UNION ALL

    SELECT
      gs.class_date,
      gs.start_time,
      gs.end_time,
      gs.id,
      gs.kind::text
    FROM public.group_schedules gs
    WHERE (
      (v_source = 'institute' AND gs.lecture_group_id = p_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_group_id)
    )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND gs.class_date >= v_start
      AND gs.class_date <= v_end

    UNION ALL

    SELECT
      s.session_date,
      COALESCE(gs_match.start_time, TIME '09:00:00'),
      COALESCE(gs_match.end_time, TIME '23:59:59'),
      gs_match.id,
      COALESCE(gs_match.kind::text, 'session')
    FROM public.group_attendance_sessions s
    LEFT JOIN LATERAL (
      SELECT gs2.id, gs2.kind, gs2.start_time, gs2.end_time
      FROM public.group_schedules gs2
      WHERE s.schedule_id IS NULL
        AND (
          (v_source = 'institute' AND gs2.lecture_group_id = p_group_id)
          OR (v_source = 'personal' AND gs2.teacher_personal_group_id = p_group_id)
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
        gs2.start_time
      LIMIT 1
    ) gs_match ON true
    WHERE (
      (v_source = 'institute' AND s.lecture_group_id = p_group_id)
      OR (v_source = 'personal' AND s.teacher_personal_group_id = p_group_id)
    )
      AND s.session_date >= v_start
      AND s.session_date <= v_end
      AND s.schedule_id IS NULL
      AND gs_match.id IS NULL
  ),
  occurrence_rows AS (
    SELECT
      so.class_date,
      so.start_time,
      so.end_time,
      so.schedule_id,
      CASE
        WHEN so.schedule_kind = 'one_time' THEN 'one_time'
        WHEN so.schedule_kind = 'recurring_weekly' THEN 'recurring_weekly'
        ELSE 'session'
      END AS occurrence_kind,
      mark.marked_present,
      mark.recorded_at
    FROM schedule_occurrences so
    LEFT JOIN LATERAL (
      SELECT
        m.present AS marked_present,
        m.recorded_at
      FROM public.group_attendance_sessions s
      INNER JOIN public.group_attendance_marks m ON m.session_id = s.id
      WHERE s.session_date = so.class_date
        AND (
          (v_source = 'institute' AND s.lecture_group_id = p_group_id)
          OR (v_source = 'personal' AND s.teacher_personal_group_id = p_group_id)
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
                  AND r.teacher_personal_group_id = p_group_id
              )
            )
          )
        )
        AND (
          (so.schedule_id IS NOT NULL AND s.schedule_id = so.schedule_id)
          OR (
            so.schedule_id IS NOT NULL
            AND s.schedule_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.group_attendance_sessions s2
              WHERE s2.session_date = so.class_date
                AND (
                  (v_source = 'institute' AND s2.lecture_group_id = p_group_id)
                  OR (v_source = 'personal' AND s2.teacher_personal_group_id = p_group_id)
                )
                AND s2.schedule_id = so.schedule_id
            )
          )
          OR (so.schedule_id IS NULL AND s.schedule_id IS NULL)
        )
      ORDER BY (s.schedule_id IS NOT DISTINCT FROM so.schedule_id) DESC, m.recorded_at DESC
      LIMIT 1
    ) mark ON true
  ),
  eligible AS (
    SELECT
      o.class_date,
      o.start_time,
      o.end_time,
      o.occurrence_kind,
      o.marked_present,
      o.recorded_at,
      (
        o.class_date < v_end
        OR (o.class_date = v_end AND o.end_time <= v_time)
        OR o.marked_present IS NOT NULL
      ) AS is_eligible
    FROM occurrence_rows o
  )
  SELECT
    e.class_date,
    to_char(e.start_time, 'HH24:MI')::text AS start_time,
    to_char(e.end_time, 'HH24:MI')::text AS end_time,
    e.occurrence_kind,
    COALESCE(e.marked_present, false) AS is_present,
    e.recorded_at,
    (e.marked_present IS NOT NULL) AS has_mark
  FROM eligible e
  WHERE e.is_eligible
  ORDER BY e.class_date, e.start_time;
END;
$$;

NOTIFY pgrst, 'reload schema';
