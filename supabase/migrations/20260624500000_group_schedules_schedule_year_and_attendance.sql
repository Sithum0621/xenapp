-- Recurring weekly schedules are scoped to a calendar year (schedule_year).
-- One-time extra classes count for attendance only after end_time on that day;
-- attendance history for extras remains within the rolling window (up to 30 days).

ALTER TABLE public.group_schedules
  ADD COLUMN IF NOT EXISTS schedule_year smallint;

UPDATE public.group_schedules gs
SET schedule_year = EXTRACT(YEAR FROM gs.created_at AT TIME ZONE 'UTC')::smallint
WHERE gs.kind = 'recurring_weekly'::public.group_schedule_kind
  AND gs.schedule_year IS NULL;

ALTER TABLE public.group_schedules
  ALTER COLUMN schedule_year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::smallint;

ALTER TABLE public.group_schedules
  DROP CONSTRAINT IF EXISTS group_schedules_recurring_year_ck;

ALTER TABLE public.group_schedules
  ADD CONSTRAINT group_schedules_recurring_year_ck CHECK (
    (
      kind = 'recurring_weekly'::public.group_schedule_kind
      AND schedule_year IS NOT NULL
      AND schedule_year >= 2000
      AND schedule_year <= 2100
    )
    OR (
      kind = 'one_time'::public.group_schedule_kind
      AND schedule_year IS NULL
    )
  );

COMMENT ON COLUMN public.group_schedules.schedule_year IS
  'Calendar year this recurring weekly slot applies to (Jan–Dec). NULL for one-time extra classes.';

-- Institute admin: set schedule_year when creating recurring weekly slots.
CREATE OR REPLACE FUNCTION public.institute_admin_create_group_schedule(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_group uuid;
  v_kind text;
  v_dow int;
  v_date date;
  v_start time;
  v_end time;
  v_year smallint;
  v_id uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  BEGIN
    v_group := trim(coalesce(p_payload->>'lecture_group_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_lecture_group_id';
  END;

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'lecture_group_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lecture_groups g
    WHERE g.id = v_group AND g.institute_id = v_inst
  ) THEN
    RAISE EXCEPTION 'lecture_group_not_in_institute';
  END IF;

  v_kind := lower(trim(coalesce(p_payload->>'kind', '')));
  IF v_kind NOT IN ('recurring_weekly', 'one_time') THEN
    RAISE EXCEPTION 'invalid_schedule_kind';
  END IF;

  BEGIN
    v_start := trim(coalesce(p_payload->>'start_time', ''))::time;
    v_end := trim(coalesce(p_payload->>'end_time', ''))::time;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_time';
  END;

  IF v_start >= v_end THEN
    RAISE EXCEPTION 'end_before_start';
  END IF;

  IF v_kind = 'recurring_weekly' THEN
    BEGIN
      v_dow := (p_payload->>'day_of_week')::int;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_day_of_week';
    END;
    IF v_dow IS NULL OR v_dow < 0 OR v_dow > 6 THEN
      RAISE EXCEPTION 'invalid_day_of_week';
    END IF;

    BEGIN
      v_year := COALESCE(
        NULLIF(trim(coalesce(p_payload->>'schedule_year', '')), '')::smallint,
        EXTRACT(YEAR FROM CURRENT_DATE)::smallint
      );
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_schedule_year';
    END;

    INSERT INTO public.group_schedules (
      lecture_group_id,
      kind,
      day_of_week,
      class_date,
      start_time,
      end_time,
      schedule_year
    )
    VALUES (
      v_group,
      'recurring_weekly'::public.group_schedule_kind,
      v_dow,
      NULL,
      v_start,
      v_end,
      v_year
    )
    RETURNING group_schedules.id INTO v_id;
  ELSE
    BEGIN
      v_date := trim(coalesce(p_payload->>'class_date', ''))::date;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_class_date';
    END;
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'class_date_required';
    END IF;

    INSERT INTO public.group_schedules (
      lecture_group_id,
      kind,
      day_of_week,
      class_date,
      start_time,
      end_time,
      schedule_year
    )
    VALUES (
      v_group,
      'one_time'::public.group_schedule_kind,
      NULL,
      v_date,
      v_start,
      v_end,
      NULL
    )
    RETURNING group_schedules.id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_days_for_group(uuid, uuid, text, date, date);

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
    SELECT
      ser.d::date AS class_date,
      gs.end_time,
      gs.id AS schedule_id
    FROM generate_series(v_start, v_end, interval '1 day') AS ser(d)
    INNER JOIN public.group_schedules gs ON (
      (v_source = 'institute' AND gs.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_lecture_group_id)
    )
    WHERE gs.kind = 'recurring_weekly'::public.group_schedule_kind
      AND gs.schedule_year = EXTRACT(YEAR FROM ser.d)::int
      AND gs.day_of_week = EXTRACT(DOW FROM ser.d)::int

    UNION ALL

    SELECT
      gs.class_date,
      gs.end_time,
      gs.id
    FROM public.group_schedules gs
    WHERE (
      (v_source = 'institute' AND gs.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND gs.teacher_personal_group_id = p_lecture_group_id)
    )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND gs.class_date >= v_start
      AND gs.class_date <= v_end

    UNION ALL

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
          ORDER BY gs2.end_time DESC
          LIMIT 1
        ),
        TIME '23:59:59'
      ) AS end_time,
      NULL::uuid AS schedule_id
    FROM public.group_attendance_sessions s
    WHERE (
      (v_source = 'institute' AND s.lecture_group_id = p_lecture_group_id)
      OR (v_source = 'personal' AND s.teacher_personal_group_id = p_lecture_group_id)
    )
      AND s.session_date >= v_start
      AND s.session_date <= v_end
  ),
  occurrence_rows AS (
    SELECT DISTINCT
      so.class_date,
      so.end_time,
      so.schedule_id,
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
  )
  SELECT
    o.class_date,
    COALESCE(o.marked_present, false) AS present
  FROM occurrence_rows o
  WHERE o.class_date < v_end
     OR (o.class_date = v_end AND o.end_time <= v_time)
     OR o.marked_present IS NOT NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_by_group(uuid, int, date);

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
        COUNT(*) FILTER (WHERE d.present)::int AS present_count,
        COUNT(*) FILTER (WHERE NOT d.present)::int AS absent_count
      FROM public.student_attendance_days_for_group(
        p_student_user_id,
        g.id,
        'institute',
        v_start,
        v_end,
        p_local_time
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
        v_end,
        p_local_time
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
    agg.class_date::text AS session_date,
    agg.present
  FROM (
    SELECT
      d.class_date,
      BOOL_OR(d.present) AS present
    FROM public.student_attendance_days_for_group(
      p_student_user_id,
      p_group_id,
      v_source,
      v_start,
      v_end,
      p_local_time
    ) d
    GROUP BY d.class_date
  ) agg
  ORDER BY agg.class_date;
END;
$$;

DROP FUNCTION IF EXISTS public.student_attendance_summary(uuid, int, date);

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
      v_end,
      p_local_time
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
      v_end,
      p_local_time
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

-- Student-facing schedule payloads: current-year recurring only; active/future extras only.
DROP FUNCTION IF EXISTS public.student_list_classes_for_student(uuid);

CREATE OR REPLACE FUNCTION public.student_list_classes_for_student(p_student_user_id uuid)
RETURNS TABLE (
  lecture_group_id uuid,
  group_source text,
  group_name text,
  group_description text,
  institute_id uuid,
  institute_name text,
  teacher_name text,
  monthly_fee_cents integer,
  payment_status text,
  payment_billing_month date,
  payment_amount_cents integer,
  schedules jsonb,
  delivery jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_month date := public.current_billing_month();
  v_year  int  := EXTRACT(YEAR FROM CURRENT_DATE)::int;
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
      COALESCE(g.description, '')::text AS group_description,
      g.institute_id AS institute_id,
      COALESCE(i.name, '')::text AS institute_name,
      public.profile_display_name(g.primary_teacher_user_id) AS teacher_name,
      COALESCE(gpr.amount_cents, g.default_monthly_fee_cents)::integer AS monthly_fee_cents,
      CASE
        WHEN overdue.billing_month IS NOT NULL THEN 'overdue'
        WHEN gpr.status = 'collected'::public.group_payment_status THEN 'paid'
        ELSE 'pending'
      END::text AS payment_status,
      COALESCE(overdue.billing_month, v_month) AS payment_billing_month,
      CASE
        WHEN overdue.billing_month IS NOT NULL THEN overdue.amount_cents
        WHEN gpr.amount_cents IS NOT NULL THEN gpr.amount_cents
        ELSE g.default_monthly_fee_cents
      END::integer AS payment_amount_cents,
      COALESCE(
        (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id', gs.id,
                     'kind', gs.kind::text,
                     'day_of_week', gs.day_of_week,
                     'class_date', gs.class_date,
                     'start_time', to_char(gs.start_time, 'HH24:MI'),
                     'end_time', to_char(gs.end_time, 'HH24:MI'),
                     'schedule_year', gs.schedule_year
                   )
                   ORDER BY
                     CASE WHEN gs.kind = 'one_time'::public.group_schedule_kind
                            AND gs.class_date >= CURRENT_DATE THEN 0 ELSE 1 END,
                     gs.class_date NULLS LAST,
                     gs.day_of_week NULLS LAST,
                     gs.start_time
               )
          FROM public.group_schedules gs
          WHERE gs.lecture_group_id = g.id
            AND (
              (
                gs.kind = 'recurring_weekly'::public.group_schedule_kind
                AND gs.schedule_year = v_year
              )
              OR (
                gs.kind = 'one_time'::public.group_schedule_kind
                AND gs.class_date >= CURRENT_DATE
              )
            )
        ),
        '[]'::jsonb
      ) AS schedules,
      jsonb_build_object(
        'mode', COALESCE(d.mode::text, 'physical'),
        'venue_label', COALESCE(NULLIF(trim(d.venue_label), ''), COALESCE(i.name, ''), ''),
        'physical_location_label', d.physical_location_label,
        'physical_location_url', d.physical_location_url,
        'online_join_url', d.online_join_url
      ) AS delivery
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.lecture_group_delivery d ON d.lecture_group_id = g.id
    LEFT JOIN LATERAL (
      SELECT gpr_inner.amount_cents, gpr_inner.status
      FROM public.group_payment_records gpr_inner
      WHERE gpr_inner.lecture_group_id = g.id
        AND gpr_inner.student_user_id = p_student_user_id
        AND gpr_inner.billing_month = v_month
      LIMIT 1
    ) gpr ON true
    LEFT JOIN LATERAL (
      SELECT gpr_o.billing_month, gpr_o.amount_cents
      FROM public.group_payment_records gpr_o
      WHERE gpr_o.lecture_group_id = g.id
        AND gpr_o.student_user_id = p_student_user_id
        AND gpr_o.status = 'pending'::public.group_payment_status
        AND gpr_o.billing_month < v_month
      ORDER BY gpr_o.billing_month ASC
      LIMIT 1
    ) overdue ON true
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    SELECT
      pg.id AS lecture_group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      ''::text AS group_description,
      NULL::uuid AS institute_id,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS teacher_name,
      COALESCE(gpr.amount_cents, pg.default_monthly_fee_cents)::integer AS monthly_fee_cents,
      CASE
        WHEN overdue.billing_month IS NOT NULL THEN 'overdue'
        WHEN gpr.status = 'collected'::public.group_payment_status THEN 'paid'
        ELSE 'pending'
      END::text AS payment_status,
      COALESCE(overdue.billing_month, v_month) AS payment_billing_month,
      CASE
        WHEN overdue.billing_month IS NOT NULL THEN overdue.amount_cents
        WHEN gpr.amount_cents IS NOT NULL THEN gpr.amount_cents
        ELSE pg.default_monthly_fee_cents
      END::integer AS payment_amount_cents,
      COALESCE(
        (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id', gs.id,
                     'kind', gs.kind::text,
                     'day_of_week', gs.day_of_week,
                     'class_date', gs.class_date,
                     'start_time', to_char(gs.start_time, 'HH24:MI'),
                     'end_time', to_char(gs.end_time, 'HH24:MI'),
                     'schedule_year', gs.schedule_year
                   )
                   ORDER BY
                     CASE WHEN gs.kind = 'one_time'::public.group_schedule_kind
                            AND gs.class_date >= CURRENT_DATE THEN 0 ELSE 1 END,
                     gs.class_date NULLS LAST,
                     gs.day_of_week NULLS LAST,
                     gs.start_time
               )
          FROM public.group_schedules gs
          WHERE gs.teacher_personal_group_id = pg.id
            AND (
              (
                gs.kind = 'recurring_weekly'::public.group_schedule_kind
                AND gs.schedule_year = v_year
              )
              OR (
                gs.kind = 'one_time'::public.group_schedule_kind
                AND gs.class_date >= CURRENT_DATE
              )
            )
        ),
        '[]'::jsonb
      ) AS schedules,
      jsonb_build_object(
        'mode', 'physical',
        'venue_label', COALESCE(
          NULLIF(trim(tp.full_name), ''),
          NULLIF(
            CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
            ''
          ),
          pg.name::text
        ),
        'physical_location_label', NULL,
        'physical_location_url', NULL,
        'online_join_url', NULL
      ) AS delivery
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    LEFT JOIN LATERAL (
      SELECT gpr_inner.amount_cents, gpr_inner.status
      FROM public.group_payment_records gpr_inner
      WHERE gpr_inner.teacher_personal_group_id = pg.id
        AND gpr_inner.student_user_id = p_student_user_id
        AND gpr_inner.billing_month = v_month
      LIMIT 1
    ) gpr ON true
    LEFT JOIN LATERAL (
      SELECT gpr_o.billing_month, gpr_o.amount_cents
      FROM public.group_payment_records gpr_o
      WHERE gpr_o.teacher_personal_group_id = pg.id
        AND gpr_o.student_user_id = p_student_user_id
        AND gpr_o.status = 'pending'::public.group_payment_status
        AND gpr_o.billing_month < v_month
      ORDER BY gpr_o.billing_month ASC
      LIMIT 1
    ) overdue ON true
    WHERE r.student_user_id = p_student_user_id
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

-- Today schedule: current-year recurring + extras still running today.
DROP FUNCTION IF EXISTS public.student_today_schedule(uuid, date, int);

CREATE OR REPLACE FUNCTION public.student_today_schedule(
  p_student_user_id uuid,
  p_local_date      date DEFAULT NULL,
  p_local_dow       int DEFAULT NULL
)
RETURNS TABLE (
  schedule_id uuid,
  lecture_group_id uuid,
  group_source text,
  group_name text,
  institute_name text,
  start_time text,
  end_time text,
  kind text,
  delivery_mode text,
  venue_label text,
  physical_location_label text,
  physical_location_url text,
  online_join_url text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := COALESCE(p_local_date, CURRENT_DATE);
  v_dow   int  := COALESCE(p_local_dow, EXTRACT(DOW FROM v_today)::int);
  v_year  int  := EXTRACT(YEAR FROM v_today)::int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_local_dow IS NOT NULL AND (p_local_dow < 0 OR p_local_dow > 6) THEN
    RAISE EXCEPTION 'invalid_local_dow';
  END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      gs.id AS schedule_id,
      g.id AS lecture_group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(i.name, '')::text AS institute_name,
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      gs.kind::text AS kind,
      COALESCE(d.mode::text, 'physical') AS delivery_mode,
      COALESCE(NULLIF(trim(d.venue_label), ''), COALESCE(i.name, '')) AS venue_label,
      d.physical_location_label::text,
      d.physical_location_url::text,
      d.online_join_url::text
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    INNER JOIN public.group_schedules gs ON gs.lecture_group_id = g.id
    LEFT JOIN public.lecture_group_delivery d ON d.lecture_group_id = g.id
    WHERE lgs.student_user_id = p_student_user_id
      AND (
        (
          gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow
        )
        OR (
          gs.kind = 'one_time'::public.group_schedule_kind
          AND gs.class_date = v_today
        )
      )

    UNION ALL

    SELECT
      gs.id AS schedule_id,
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
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      gs.kind::text AS kind,
      'physical'::text AS delivery_mode,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        pg.name::text
      ) AS venue_label,
      NULL::text AS physical_location_label,
      NULL::text AS physical_location_url,
      NULL::text AS online_join_url
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    INNER JOIN public.group_schedules gs ON gs.teacher_personal_group_id = pg.id
    WHERE r.student_user_id = p_student_user_id
      AND (
        (
          gs.kind = 'recurring_weekly'::public.group_schedule_kind
          AND gs.schedule_year = v_year
          AND gs.day_of_week = v_dow
        )
        OR (
          gs.kind = 'one_time'::public.group_schedule_kind
          AND gs.class_date = v_today
        )
      )
  ) combined
  ORDER BY combined.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.student_attendance_days_for_group(uuid, uuid, text, date, date, time) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.student_attendance_by_group(uuid, int, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_by_group(uuid, int, date, time) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_group_calendar(uuid, uuid, text, int, date, time) TO authenticated;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int, date, time) TO authenticated;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.student_today_schedule(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_today_schedule(uuid, date, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
