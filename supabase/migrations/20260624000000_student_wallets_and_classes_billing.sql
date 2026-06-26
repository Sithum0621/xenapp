-- Student wallets (per parent_student profile), group default fees, and billing RPCs
-- for the parent Classes tab (wallet balance, monthly due, teacher name, class fee).

-- ---------------------------------------------------------------------------
-- Group default monthly fees (cents, LKR)
-- ---------------------------------------------------------------------------

ALTER TABLE public.lecture_groups
  ADD COLUMN IF NOT EXISTS default_monthly_fee_cents integer NOT NULL DEFAULT 450000
    CHECK (default_monthly_fee_cents >= 0);

ALTER TABLE public.teacher_personal_groups
  ADD COLUMN IF NOT EXISTS default_monthly_fee_cents integer NOT NULL DEFAULT 450000
    CHECK (default_monthly_fee_cents >= 0);

COMMENT ON COLUMN public.lecture_groups.default_monthly_fee_cents IS
  'Default monthly class fee in cents when no group_payment_records row exists for the month.';
COMMENT ON COLUMN public.teacher_personal_groups.default_monthly_fee_cents IS
  'Default monthly class fee in cents for personal groups.';

-- ---------------------------------------------------------------------------
-- Student wallets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.student_wallets (
  student_user_id uuid PRIMARY KEY
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.student_wallets IS
  'One wallet per student (parent_student profile). Balance in cents; mutations via SECURITY DEFINER RPCs.';

CREATE OR REPLACE FUNCTION public.student_wallets_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_wallets_updated_at ON public.student_wallets;
CREATE TRIGGER student_wallets_updated_at
  BEFORE UPDATE ON public.student_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.student_wallets_set_updated_at();

ALTER TABLE public.student_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_wallets_select_linked ON public.student_wallets;
CREATE POLICY student_wallets_select_linked
  ON public.student_wallets
  FOR SELECT TO authenticated
  USING (public.parent_may_view_student(auth.uid(), student_user_id));

GRANT SELECT ON public.student_wallets TO authenticated;

-- ---------------------------------------------------------------------------
-- Wallet transaction log (top-ups, future payments)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.student_wallet_tx_kind AS ENUM ('top_up', 'payment', 'refund', 'adjustment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.student_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind public.student_wallet_tx_kind NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  note text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_wallet_tx_student_idx
  ON public.student_wallet_transactions (student_user_id, created_at DESC);

COMMENT ON TABLE public.student_wallet_transactions IS
  'Append-only wallet ledger; balance on student_wallets is updated in RPCs.';

ALTER TABLE public.student_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_wallet_tx_select_linked ON public.student_wallet_transactions;
CREATE POLICY student_wallet_tx_select_linked
  ON public.student_wallet_transactions
  FOR SELECT TO authenticated
  USING (public.parent_may_view_student(auth.uid(), student_user_id));

GRANT SELECT ON public.student_wallet_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_billing_month()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', CURRENT_DATE)::date;
$$;

CREATE OR REPLACE FUNCTION public.profile_display_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    NULLIF(
      CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
      ''
    ),
    'Teacher'
  )::text
  FROM public.profiles p
  WHERE p.id = p_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_wallet(p_student_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_student_user_id IS NULL THEN
    RAISE EXCEPTION 'student_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_student_user_id
      AND role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  INSERT INTO public.student_wallets (student_user_id)
  VALUES (p_student_user_id)
  ON CONFLICT (student_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_student_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_student_wallet(uuid) TO authenticated;

-- Backfill wallets for existing students
INSERT INTO public.student_wallets (student_user_id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'parent_student'::public.profile_role_v2
ON CONFLICT (student_user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Billing overview (wallet + monthly due)
-- ---------------------------------------------------------------------------

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

  -- Institute lecture groups
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

  -- Teacher personal groups
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

REVOKE ALL ON FUNCTION public.student_classes_billing_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_classes_billing_overview(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Wallet top-up (parent / self) — transfer UI will call this later
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.student_wallet_top_up(
  p_student_user_id uuid,
  p_amount_cents bigint,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_new_bal bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'amount_too_large';
  END IF;

  PERFORM public.ensure_student_wallet(p_student_user_id);

  UPDATE public.student_wallets
  SET balance_cents = balance_cents + p_amount_cents
  WHERE student_user_id = p_student_user_id
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.student_wallet_transactions (
    student_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    p_student_user_id,
    'top_up'::public.student_wallet_tx_kind,
    p_amount_cents,
    v_new_bal,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user
  );

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'wallet_balance_cents', v_new_bal,
    'amount_cents', p_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_wallet_top_up(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_wallet_top_up(uuid, bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Class list RPCs — add teacher_name + monthly_fee_cents
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.student_list_classes_for_student(uuid);
DROP FUNCTION IF EXISTS public.student_list_my_classes();

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

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.student_list_my_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_my_classes() TO authenticated;

NOTIFY pgrst, 'reload schema';
