-- Class fee collection: extend student package when app fee (Rs. 200) is included + push notifications.

CREATE OR REPLACE FUNCTION public.xen_platform_fee_subscription_days()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 30;
$$;

CREATE OR REPLACE FUNCTION public.extend_parent_student_subscription(
  p_student_user_id uuid,
  p_days integer DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.profile_role_v2;
  v_days integer := COALESCE(NULLIF(p_days, 0), public.xen_platform_fee_subscription_days());
  v_current_expiry timestamptz;
  v_new_expiry timestamptz;
  v_device text;
BEGIN
  IF p_student_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  IF NOT FOUND OR v_role <> 'parent_student'::public.profile_role_v2 THEN
    RETURN NULL;
  END IF;

  IF public.role_has_unlimited_subscription(v_role) THEN
    RETURN 'infinity'::timestamptz;
  END IF;

  SELECT s.expiry_date, s.device_id
  INTO v_current_expiry, v_device
  FROM public.subscriptions s
  WHERE s.user_id = p_student_user_id;

  IF v_current_expiry = 'infinity'::timestamptz THEN
    RETURN v_current_expiry;
  END IF;

  v_new_expiry :=
    GREATEST(COALESCE(v_current_expiry, now()), now()) + make_interval(days => v_days);

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
  VALUES (
    p_student_user_id,
    COALESCE(NULLIF(trim(v_device), ''), 'package-extended'),
    v_new_expiry,
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    expiry_date = EXCLUDED.expiry_date,
    is_active = true,
    updated_at = now();

  UPDATE public.profiles
  SET
    trial_ends_at = v_new_expiry,
    subscription_status = 'active'
  WHERE id = p_student_user_id;

  RETURN v_new_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_parent_student_subscription(uuid, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.notify_student_package_added(
  p_student_user_id uuid,
  p_expiry_date timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_expiry_label text;
  v_parent uuid;
BEGIN
  IF p_student_user_id IS NULL OR p_expiry_date IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Student'
  )
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  IF p_expiry_date = 'infinity'::timestamptz THEN
    v_expiry_label := 'unlimited access';
  ELSE
    v_expiry_label := to_char(p_expiry_date AT TIME ZONE 'Asia/Colombo', 'Mon DD, YYYY');
  END IF;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    p_student_user_id,
    'Your package was successfully added',
    format('Your XEN package is active until %s.', v_expiry_label),
    jsonb_build_object(
      'type', 'package_added',
      'student_user_id', p_student_user_id,
      'expiry_date', p_expiry_date,
      'route', '/parent-dashboard'
    )
  );

  FOR v_parent IN
    SELECT psl.parent_user_id
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = p_student_user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_parent,
      'Package successfully added',
      format('%s''s XEN package is active until %s.', v_student_name, v_expiry_label),
      jsonb_build_object(
        'type', 'package_added',
        'student_user_id', p_student_user_id,
        'expiry_date', p_expiry_date,
        'route', '/parent-dashboard'
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_student_package_added(uuid, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.notify_student_class_fee_paid(
  p_student_user_id uuid,
  p_group_name text,
  p_amount_cents integer,
  p_billing_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_amount_label text;
  v_month_label text;
  v_parent uuid;
BEGIN
  IF p_student_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'Student'
  )
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  v_amount_label := public.format_lkr_from_cents(p_amount_cents);
  v_month_label := to_char(COALESCE(p_billing_month, public.current_billing_month()), 'Month YYYY');

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    p_student_user_id,
    'Class payment complete',
    format(
      'Your payment of %s for %s is complete for %s.',
      v_amount_label,
      COALESCE(NULLIF(trim(p_group_name), ''), 'your class'),
      v_month_label
    ),
    jsonb_build_object(
      'type', 'class_fee_paid',
      'student_user_id', p_student_user_id,
      'group_name', p_group_name,
      'amount_cents', p_amount_cents,
      'billing_month', p_billing_month,
      'route', '/parent-dashboard/classes'
    )
  );

  FOR v_parent IN
    SELECT psl.parent_user_id
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = p_student_user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_parent,
      'Class payment complete',
      format(
        '%s''s payment of %s for %s is complete for %s.',
        v_student_name,
        v_amount_label,
        COALESCE(NULLIF(trim(p_group_name), ''), 'class'),
        v_month_label
      ),
      jsonb_build_object(
        'type', 'class_fee_paid',
        'student_user_id', p_student_user_id,
        'group_name', p_group_name,
        'amount_cents', p_amount_cents,
        'billing_month', p_billing_month,
        'route', '/parent-dashboard/classes'
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_student_class_fee_paid(uuid, text, integer, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.teacher_collect_class_fee(
  p_student_user_id uuid,
  p_group_id uuid,
  p_group_source text,
  p_collection_method text,
  p_include_platform_fee boolean DEFAULT false
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
  v_new_expiry timestamptz;
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

  PERFORM public.notify_student_class_fee_paid(
    p_student_user_id,
    v_group_name,
    v_fee_cents,
    v_month
  );

  IF v_platform_fee > 0 THEN
    v_new_expiry := public.extend_parent_student_subscription(p_student_user_id, NULL);
    IF v_new_expiry IS NOT NULL THEN
      PERFORM public.notify_student_package_added(p_student_user_id, v_new_expiry);
    END IF;
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
    'billing_month', v_month,
    'subscription_extended', v_platform_fee > 0 AND v_new_expiry IS NOT NULL,
    'subscription_expiry', v_new_expiry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_collect_class_fee(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_collect_class_fee(uuid, uuid, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
