-- Single-round-trip teacher dashboard overview (classes, counts, payments, wallet balance).

CREATE OR REPLACE FUNCTION public.teacher_dashboard_overview(p_billing_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month date;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_balance bigint := 0;
  v_classes jsonb := '[]'::jsonb;
  v_total_students integer := 0;
  v_total_income bigint := 0;
  v_wallet_income bigint := 0;
  v_due_payment bigint := 0;
  v_platform_fee bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  v_month := COALESCE(p_billing_month, date_trunc('month', CURRENT_DATE)::date);

  SELECT p.first_name, p.last_name, p.full_name
  INTO v_first_name, v_last_name, v_full_name
  FROM public.profiles p
  WHERE p.id = v_uid;

  SELECT COALESCE(w.balance_cents, 0)
  INTO v_balance
  FROM public.teacher_wallets w
  WHERE w.teacher_user_id = v_uid;

  WITH institute_groups AS (
    SELECT
      g.id,
      g.name::text AS name,
      'institute'::text AS source,
      i.name::text AS institute_name
    FROM public.lecture_groups g
    INNER JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.lecture_group_teachers gt
      ON gt.lecture_group_id = g.id
      AND gt.teacher_user_id = v_uid
    WHERE g.primary_teacher_user_id = v_uid
      OR gt.teacher_user_id IS NOT NULL
  ),
  personal_groups AS (
    SELECT
      pg.id,
      pg.name::text AS name,
      'personal'::text AS source,
      NULL::text AS institute_name
    FROM public.teacher_personal_groups pg
    WHERE pg.teacher_user_id = v_uid
  ),
  all_groups AS (
    SELECT * FROM institute_groups
    UNION ALL
    SELECT * FROM personal_groups
  ),
  institute_counts AS (
    SELECT lgs.lecture_group_id AS group_id, COUNT(*)::integer AS student_count
    FROM public.lecture_group_students lgs
    GROUP BY lgs.lecture_group_id
  ),
  personal_counts AS (
    SELECT r.teacher_personal_group_id AS group_id, COUNT(*)::integer AS student_count
    FROM public.teacher_personal_roster_entries r
    GROUP BY r.teacher_personal_group_id
  ),
  institute_payments AS (
    SELECT
      gpr.lecture_group_id AS group_id,
      COALESCE(SUM(gpr.amount_cents) FILTER (WHERE gpr.status = 'collected'), 0)::bigint AS collected_cents,
      COALESCE(SUM(gpr.amount_cents) FILTER (WHERE gpr.status <> 'collected'), 0)::bigint AS due_payment_cents,
      COALESCE(SUM(gpr.platform_fee_cents) FILTER (WHERE gpr.status = 'collected'), 0)::bigint AS amount_to_pay_cents
    FROM public.group_payment_records gpr
    WHERE gpr.billing_month = v_month
      AND gpr.lecture_group_id IS NOT NULL
    GROUP BY gpr.lecture_group_id
  ),
  personal_payments AS (
    SELECT
      gpr.teacher_personal_group_id AS group_id,
      COALESCE(SUM(gpr.amount_cents) FILTER (WHERE gpr.status = 'collected'), 0)::bigint AS collected_cents,
      COALESCE(SUM(gpr.amount_cents) FILTER (WHERE gpr.status <> 'collected'), 0)::bigint AS due_payment_cents,
      COALESCE(SUM(gpr.platform_fee_cents) FILTER (WHERE gpr.status = 'collected'), 0)::bigint AS amount_to_pay_cents
    FROM public.group_payment_records gpr
    WHERE gpr.billing_month = v_month
      AND gpr.teacher_personal_group_id IS NOT NULL
    GROUP BY gpr.teacher_personal_group_id
  ),
  class_rows AS (
    SELECT
      g.id,
      g.source,
      g.name,
      g.institute_name,
      CASE
        WHEN g.source = 'institute' THEN COALESCE(ic.student_count, 0)
        ELSE COALESCE(pc.student_count, 0)
      END AS student_count,
      CASE
        WHEN g.source = 'institute' THEN COALESCE(ip.collected_cents, 0)
        ELSE COALESCE(pp.collected_cents, 0)
      END AS collected_cents,
      CASE
        WHEN g.source = 'institute' THEN COALESCE(ip.due_payment_cents, 0)
        ELSE COALESCE(pp.due_payment_cents, 0)
      END AS due_payment_cents,
      CASE
        WHEN g.source = 'institute' THEN COALESCE(ip.amount_to_pay_cents, 0)
        ELSE COALESCE(pp.amount_to_pay_cents, 0)
      END AS amount_to_pay_cents
    FROM all_groups g
    LEFT JOIN institute_counts ic ON g.source = 'institute' AND ic.group_id = g.id
    LEFT JOIN personal_counts pc ON g.source = 'personal' AND pc.group_id = g.id
    LEFT JOIN institute_payments ip ON g.source = 'institute' AND ip.group_id = g.id
    LEFT JOIN personal_payments pp ON g.source = 'personal' AND pp.group_id = g.id
  ),
  totals AS (
    SELECT
      COALESCE(SUM(student_count), 0)::integer AS total_students,
      COALESCE(SUM(collected_cents), 0)::bigint AS total_income,
      COALESCE(SUM(due_payment_cents), 0)::bigint AS due_payment,
      COALESCE(SUM(amount_to_pay_cents), 0)::bigint AS platform_fee
    FROM class_rows
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cr.id,
          'source', cr.source,
          'name', cr.name,
          'institute_name', cr.institute_name,
          'student_count', cr.student_count,
          'collected_cents', cr.collected_cents,
          'due_payment_cents', cr.due_payment_cents,
          'amount_to_pay_cents', cr.amount_to_pay_cents
        )
        ORDER BY lower(cr.name)
      ),
      '[]'::jsonb
    ),
    t.total_students,
    t.total_income,
    t.due_payment,
    t.platform_fee
  INTO v_classes, v_total_students, v_total_income, v_due_payment, v_platform_fee
  FROM class_rows cr
  CROSS JOIN totals t
  GROUP BY t.total_students, t.total_income, t.due_payment, t.platform_fee;

  SELECT COALESCE(SUM(gpr.amount_cents), 0)::bigint
  INTO v_wallet_income
  FROM public.group_payment_records gpr
  WHERE gpr.billing_month = v_month
    AND gpr.status = 'collected'
    AND gpr.collection_method IN ('wallet', 'online')
    AND (
      gpr.lecture_group_id IN (
        SELECT g.id
        FROM public.lecture_groups g
        LEFT JOIN public.lecture_group_teachers gt
          ON gt.lecture_group_id = g.id
          AND gt.teacher_user_id = v_uid
        WHERE g.primary_teacher_user_id = v_uid
          OR gt.teacher_user_id IS NOT NULL
      )
      OR gpr.teacher_personal_group_id IN (
        SELECT pg.id
        FROM public.teacher_personal_groups pg
        WHERE pg.teacher_user_id = v_uid
      )
    );

  RETURN jsonb_build_object(
    'teacher_first_name', COALESCE(v_first_name, ''),
    'teacher_last_name', COALESCE(v_last_name, ''),
    'teacher_full_name', COALESCE(v_full_name, ''),
    'billing_month', to_char(v_month, 'YYYY-MM-DD'),
    'classes', COALESCE(v_classes, '[]'::jsonb),
    'total_students', COALESCE(v_total_students, 0),
    'total_income_cents', COALESCE(v_total_income, 0),
    'wallet_cents', COALESCE(v_wallet_income, 0),
    'teacher_wallet_balance_cents', COALESCE(v_balance, 0),
    'due_payment_cents', COALESCE(v_due_payment, 0),
    'amount_to_pay_cents', COALESCE(v_platform_fee, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_dashboard_overview(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_dashboard_overview(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
