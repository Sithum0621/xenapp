-- STABLE RPCs cannot INSERT (ensure_student_wallet). Use triggers + read-only SELECTs.

-- Auto-create wallet when a parent_student profile exists
CREATE OR REPLACE FUNCTION public.trg_profiles_ensure_student_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'parent_student'::public.profile_role_v2 THEN
    INSERT INTO public.student_wallets (student_user_id)
    VALUES (NEW.id)
    ON CONFLICT (student_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_student_wallet_ins ON public.profiles;
CREATE TRIGGER profiles_ensure_student_wallet_ins
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_ensure_student_wallet();

DROP TRIGGER IF EXISTS profiles_ensure_student_wallet_role ON public.profiles;
CREATE TRIGGER profiles_ensure_student_wallet_role
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (
    NEW.role = 'parent_student'::public.profile_role_v2
    AND (OLD.role IS DISTINCT FROM NEW.role)
  )
  EXECUTE FUNCTION public.trg_profiles_ensure_student_wallet();

-- Backfill any students still missing a wallet row
INSERT INTO public.student_wallets (student_user_id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'parent_student'::public.profile_role_v2
  AND NOT EXISTS (
    SELECT 1 FROM public.student_wallets w WHERE w.student_user_id = p.id
  )
ON CONFLICT (student_user_id) DO NOTHING;

-- Billing overview: read-only (no INSERT)
CREATE OR REPLACE FUNCTION public.student_classes_billing_overview(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_month         date := public.current_billing_month();
  v_balance       bigint := 0;
  v_due           bigint := 0;
  v_fee_line      bigint;
  v_gpr_amount    integer;
  v_gpr_status    public.group_payment_status;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT w.balance_cents INTO v_balance
  FROM public.student_wallets w
  WHERE w.student_user_id = p_student_user_id;

  v_balance := COALESCE(v_balance, 0);

  FOR v_fee_line, v_gpr_amount, v_gpr_status IN
    SELECT
      g.default_monthly_fee_cents,
      gpr.amount_cents,
      gpr.status
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.group_payment_records gpr
      ON gpr.lecture_group_id = lgs.lecture_group_id
     AND gpr.student_user_id = lgs.student_user_id
     AND gpr.billing_month = v_month
    WHERE lgs.student_user_id = p_student_user_id
  LOOP
    IF v_gpr_amount IS NULL THEN
      v_due := v_due + v_fee_line;
    ELSIF v_gpr_status = 'pending'::public.group_payment_status THEN
      v_due := v_due + v_gpr_amount;
    END IF;
  END LOOP;

  FOR v_fee_line, v_gpr_amount, v_gpr_status IN
    SELECT
      pg.default_monthly_fee_cents,
      gpr.amount_cents,
      gpr.status
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.group_payment_records gpr
      ON gpr.teacher_personal_group_id = r.teacher_personal_group_id
     AND gpr.personal_roster_id = r.id
     AND gpr.billing_month = v_month
    WHERE r.student_user_id = p_student_user_id
  LOOP
    IF v_gpr_amount IS NULL THEN
      v_due := v_due + v_fee_line;
    ELSIF v_gpr_status = 'pending'::public.group_payment_status THEN
      v_due := v_due + v_gpr_amount;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'wallet_balance_cents', v_balance,
    'currency', 'LKR',
    'billing_month', v_month,
    'monthly_total_due_cents', v_due
  );
END;
$$;

-- Class list: read-only (no INSERT)
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
    WHERE r.student_user_id = p_student_user_id
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
