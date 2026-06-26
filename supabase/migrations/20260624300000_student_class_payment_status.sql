-- Per-class payment status for the current calendar month and overdue prior months.

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
                     'end_time', to_char(gs.end_time, 'HH24:MI')
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
    LEFT JOIN public.group_payment_records gpr
      ON gpr.lecture_group_id = g.id
     AND gpr.student_user_id = lgs.student_user_id
     AND gpr.billing_month = v_month
    LEFT JOIN LATERAL (
      SELECT gpr_o.billing_month, gpr_o.amount_cents
      FROM public.group_payment_records gpr_o
      WHERE gpr_o.lecture_group_id = g.id
        AND gpr_o.student_user_id = lgs.student_user_id
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
      COALESCE(pg.description, '')::text AS group_description,
      NULL::uuid AS institute_id,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
      public.profile_display_name(pg.teacher_user_id) AS teacher_name,
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
                     'end_time', to_char(gs.end_time, 'HH24:MI')
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
    LEFT JOIN public.group_payment_records gpr
      ON gpr.teacher_personal_group_id = pg.id
     AND gpr.personal_roster_id = r.id
     AND gpr.billing_month = v_month
    LEFT JOIN LATERAL (
      SELECT gpr_o.billing_month, gpr_o.amount_cents
      FROM public.group_payment_records gpr_o
      WHERE gpr_o.teacher_personal_group_id = pg.id
        AND gpr_o.personal_roster_id = r.id
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

DROP FUNCTION IF EXISTS public.student_list_my_classes();

CREATE OR REPLACE FUNCTION public.student_list_my_classes()
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
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT * FROM public.student_list_classes_for_student(v_user);
END;
$$;

-- Total due: all pending months + current month default when no row exists yet
CREATE OR REPLACE FUNCTION public.student_classes_billing_overview(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_month   date := public.current_billing_month();
  v_balance bigint := 0;
  v_due     bigint := 0;
  v_line    bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT w.balance_cents INTO v_balance
  FROM public.student_wallets w
  WHERE w.student_user_id = p_student_user_id;

  v_balance := COALESCE(v_balance, 0);

  SELECT COALESCE(SUM(sub.due_cents), 0)::bigint INTO v_due
  FROM (
    SELECT
      (
        SELECT COALESCE(SUM(gpr_p.amount_cents), 0)::bigint
        FROM public.group_payment_records gpr_p
        WHERE gpr_p.lecture_group_id = lgs.lecture_group_id
          AND gpr_p.student_user_id = lgs.student_user_id
          AND gpr_p.status = 'pending'::public.group_payment_status
      )
      + CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.group_payment_records gpr_c
            WHERE gpr_c.lecture_group_id = lgs.lecture_group_id
              AND gpr_c.student_user_id = lgs.student_user_id
              AND gpr_c.billing_month = v_month
          ) THEN g.default_monthly_fee_cents::bigint
          ELSE 0::bigint
        END AS due_cents
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    SELECT
      (
        SELECT COALESCE(SUM(gpr_p.amount_cents), 0)::bigint
        FROM public.group_payment_records gpr_p
        WHERE gpr_p.teacher_personal_group_id = r.teacher_personal_group_id
          AND gpr_p.personal_roster_id = r.id
          AND gpr_p.status = 'pending'::public.group_payment_status
      )
      + CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.group_payment_records gpr_c
            WHERE gpr_c.teacher_personal_group_id = r.teacher_personal_group_id
              AND gpr_c.personal_roster_id = r.id
              AND gpr_c.billing_month = v_month
          ) THEN pg.default_monthly_fee_cents::bigint
          ELSE 0::bigint
        END AS due_cents
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    WHERE r.student_user_id = p_student_user_id
  ) sub;

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'wallet_balance_cents', v_balance,
    'currency', 'LKR',
    'billing_month', v_month,
    'monthly_total_due_cents', v_due
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.student_list_my_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_my_classes() TO authenticated;

NOTIFY pgrst, 'reload schema';
