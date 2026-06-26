-- Teacher scan-to-collect class fees: preview slip, wallet/cash collection, Rs. 200 platform fee.

ALTER TABLE public.group_payment_records
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0
    CHECK (platform_fee_cents >= 0);

COMMENT ON COLUMN public.group_payment_records.platform_fee_cents IS
  'XEN app collection fee owed by teacher (typically Rs. 200 = 20000 cents). Counts toward amount to pay.';

CREATE OR REPLACE FUNCTION public.xen_platform_collection_fee_cents()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 20000;
$$;

CREATE OR REPLACE FUNCTION public.teacher_resolve_class_fee_context(
  p_teacher_user_id uuid,
  p_student_user_id uuid,
  p_group_id uuid,
  p_group_source text,
  p_billing_month date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_month date := COALESCE(p_billing_month, public.current_billing_month());
  v_group_name text;
  v_fee_cents integer;
  v_roster_id uuid;
  v_gpr public.group_payment_records%ROWTYPE;
  v_wallet_bal bigint := 0;
  v_student_name text;
BEGIN
  IF p_teacher_user_id IS NULL OR p_student_user_id IS NULL OR p_group_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  IF v_src = 'personal' THEN
    IF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    SELECT pg.name, pg.default_monthly_fee_cents
    INTO v_group_name, v_fee_cents
    FROM public.teacher_personal_groups pg
    WHERE pg.id = p_group_id;

    SELECT r.id INTO v_roster_id
    FROM public.teacher_personal_roster_entries r
    WHERE r.teacher_personal_group_id = p_group_id
      AND r.student_user_id = p_student_user_id
    LIMIT 1;

    IF v_roster_id IS NULL THEN
      RAISE EXCEPTION 'student_not_in_group';
    END IF;

    SELECT gpr.* INTO v_gpr
    FROM public.group_payment_records gpr
    WHERE gpr.teacher_personal_group_id = p_group_id
      AND gpr.personal_roster_id = v_roster_id
      AND gpr.billing_month = v_month
    LIMIT 1;
  ELSE
    IF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.lecture_group_students lgs
      WHERE lgs.lecture_group_id = p_group_id
        AND lgs.student_user_id = p_student_user_id
    ) THEN
      RAISE EXCEPTION 'student_not_in_group';
    END IF;

    SELECT lg.name, lg.default_monthly_fee_cents
    INTO v_group_name, v_fee_cents
    FROM public.lecture_groups lg
    WHERE lg.id = p_group_id;

    SELECT gpr.* INTO v_gpr
    FROM public.group_payment_records gpr
    WHERE gpr.lecture_group_id = p_group_id
      AND gpr.student_user_id = p_student_user_id
      AND gpr.billing_month = v_month
    LIMIT 1;
  END IF;

  IF v_group_name IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Student'
  )
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  IF v_gpr.id IS NOT NULL THEN
    v_fee_cents := v_gpr.amount_cents;
  END IF;

  SELECT sw.balance_cents INTO v_wallet_bal
  FROM public.student_wallets sw
  WHERE sw.student_user_id = p_student_user_id;

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'student_name', v_student_name,
    'group_id', p_group_id,
    'group_source', v_src,
    'group_name', v_group_name,
    'billing_month', v_month,
    'class_fee_cents', COALESCE(v_fee_cents, 0),
    'platform_fee_cents', public.xen_platform_collection_fee_cents(),
    'student_wallet_balance_cents', COALESCE(v_wallet_bal, 0),
    'already_collected', v_gpr.id IS NOT NULL AND v_gpr.status = 'collected'::public.group_payment_status,
    'payment_record_id', v_gpr.id,
    'personal_roster_id', v_roster_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_resolve_class_fee_context(uuid, uuid, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_resolve_class_fee_context(uuid, uuid, uuid, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_preview_class_fee_collection(
  p_student_user_id uuid,
  p_group_id uuid,
  p_group_source text DEFAULT 'institute'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid := auth.uid();
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.teacher_resolve_class_fee_context(
    v_teacher, p_student_user_id, p_group_id, p_group_source, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_preview_class_fee_collection(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_preview_class_fee_collection(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_collect_class_fee(
  p_student_user_id uuid,
  p_group_id uuid,
  p_group_source text,
  p_collection_method text,
  p_include_platform_fee boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_ctx jsonb;
  v_src text;
  v_month date;
  v_fee_cents integer;
  v_platform_fee integer := 0;
  v_roster_id uuid;
  v_group_name text;
  v_student_name text;
  v_method public.group_payment_collection_method;
  v_gpr_id uuid;
  v_student_bal bigint;
  v_teacher_bal bigint;
  v_note text;
  v_method_raw text := lower(trim(COALESCE(p_collection_method, '')));
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF v_method_raw = 'wallet' THEN
    v_method := 'wallet'::public.group_payment_collection_method;
  ELSIF v_method_raw = 'manual' OR v_method_raw = 'cash' THEN
    v_method := 'manual'::public.group_payment_collection_method;
  ELSE
    RAISE EXCEPTION 'invalid_collection_method';
  END IF;

  v_ctx := public.teacher_resolve_class_fee_context(
    v_teacher, p_student_user_id, p_group_id, p_group_source, NULL
  );

  IF (v_ctx->>'already_collected')::boolean THEN
    RAISE EXCEPTION 'already_collected';
  END IF;

  v_src := v_ctx->>'group_source';
  v_month := (v_ctx->>'billing_month')::date;
  v_fee_cents := (v_ctx->>'class_fee_cents')::integer;
  v_group_name := v_ctx->>'group_name';
  v_student_name := v_ctx->>'student_name';
  v_roster_id := NULLIF(v_ctx->>'personal_roster_id', '')::uuid;

  IF v_fee_cents IS NULL OR v_fee_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_fee_amount';
  END IF;

  IF COALESCE(p_include_platform_fee, false) THEN
    v_platform_fee := public.xen_platform_collection_fee_cents();
  END IF;

  IF v_method = 'wallet'::public.group_payment_collection_method THEN
    PERFORM public.ensure_student_wallet(p_student_user_id);

    SELECT sw.balance_cents INTO v_student_bal
    FROM public.student_wallets sw
    WHERE sw.student_user_id = p_student_user_id
    FOR UPDATE;

    IF COALESCE(v_student_bal, 0) < v_fee_cents THEN
      RAISE EXCEPTION 'insufficient_student_balance';
    END IF;

    UPDATE public.student_wallets
    SET balance_cents = balance_cents - v_fee_cents
    WHERE student_user_id = p_student_user_id
    RETURNING balance_cents INTO v_student_bal;

    INSERT INTO public.student_wallet_transactions (
      student_user_id, kind, amount_cents, balance_after_cents, note, created_by
    )
    VALUES (
      p_student_user_id,
      'payment'::public.student_wallet_tx_kind,
      v_fee_cents,
      v_student_bal,
      format('Class fee — %s', v_group_name),
      v_teacher
    );

    PERFORM public.ensure_teacher_wallet(v_teacher);

    UPDATE public.teacher_wallets
    SET balance_cents = balance_cents + v_fee_cents
    WHERE teacher_user_id = v_teacher
    RETURNING balance_cents INTO v_teacher_bal;

    INSERT INTO public.teacher_wallet_transactions (
      teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
    )
    VALUES (
      v_teacher,
      'payment_received'::public.teacher_wallet_tx_kind,
      v_fee_cents,
      v_teacher_bal,
      format('Class fee — %s (%s)', v_group_name, v_student_name),
      v_teacher
    );
  END IF;

  v_note := format('Collected by teacher (%s)', v_method::text);

  IF v_src = 'personal' THEN
    INSERT INTO public.group_payment_records (
      teacher_personal_group_id,
      personal_roster_id,
      student_user_id,
      amount_cents,
      billing_month,
      status,
      collected_at,
      notes,
      collection_method,
      platform_fee_cents
    )
    VALUES (
      p_group_id,
      v_roster_id,
      p_student_user_id,
      v_fee_cents,
      v_month,
      'collected'::public.group_payment_status,
      now(),
      v_note,
      v_method,
      v_platform_fee
    )
    ON CONFLICT (teacher_personal_group_id, personal_roster_id, billing_month)
    WHERE teacher_personal_group_id IS NOT NULL AND personal_roster_id IS NOT NULL
    DO UPDATE SET
      amount_cents = EXCLUDED.amount_cents,
      status = 'collected'::public.group_payment_status,
      collected_at = now(),
      notes = EXCLUDED.notes,
      collection_method = EXCLUDED.collection_method,
      platform_fee_cents = EXCLUDED.platform_fee_cents,
      student_user_id = EXCLUDED.student_user_id
    RETURNING id INTO v_gpr_id;
  ELSE
    INSERT INTO public.group_payment_records (
      lecture_group_id,
      student_user_id,
      amount_cents,
      billing_month,
      status,
      collected_at,
      notes,
      collection_method,
      platform_fee_cents
    )
    VALUES (
      p_group_id,
      p_student_user_id,
      v_fee_cents,
      v_month,
      'collected'::public.group_payment_status,
      now(),
      v_note,
      v_method,
      v_platform_fee
    )
    ON CONFLICT (lecture_group_id, student_user_id, billing_month)
    WHERE lecture_group_id IS NOT NULL AND student_user_id IS NOT NULL
    DO UPDATE SET
      amount_cents = EXCLUDED.amount_cents,
      status = 'collected'::public.group_payment_status,
      collected_at = now(),
      notes = EXCLUDED.notes,
      collection_method = EXCLUDED.collection_method,
      platform_fee_cents = EXCLUDED.platform_fee_cents
    RETURNING id INTO v_gpr_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_record_id', v_gpr_id,
    'student_user_id', p_student_user_id,
    'student_name', v_student_name,
    'group_name', v_group_name,
    'class_fee_cents', v_fee_cents,
    'platform_fee_cents', v_platform_fee,
    'collection_method', v_method::text,
    'billing_month', v_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_collect_class_fee(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_collect_class_fee(uuid, uuid, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
