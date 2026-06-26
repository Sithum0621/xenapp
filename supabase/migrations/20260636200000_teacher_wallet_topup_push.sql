-- Push notification when teacher wallet top-up completes (PayHere or superadmin approval).

CREATE OR REPLACE FUNCTION public.format_lkr_from_cents(p_cents bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Rs. ' || trim(to_char(COALESCE(p_cents, 0) / 100.0, 'FM999,999,999,990.00'));
$$;

CREATE OR REPLACE FUNCTION public.notify_teacher_wallet_payment_success(
  p_teacher_user_id uuid,
  p_amount_cents bigint,
  p_method text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text := lower(trim(COALESCE(p_method, 'manual')));
  v_amount_label text;
BEGIN
  IF p_teacher_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN;
  END IF;

  IF v_method NOT IN ('payhere', 'manual') THEN
    v_method := 'manual';
  END IF;

  v_amount_label := public.format_lkr_from_cents(p_amount_cents);

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (
    p_teacher_user_id,
    'Your payment was successful',
    format('%s was added to your wallet.', v_amount_label),
    jsonb_build_object(
      'type', 'wallet_top_up',
      'method', v_method,
      'amount_cents', p_amount_cents,
      'route', '/teacher-dashboard/wallet'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_teacher_wallet_payment_success(uuid, bigint, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.teacher_wallet_complete_payhere_order(
  p_order_id text,
  p_payment_id text,
  p_amount_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.teacher_wallet_payhere_orders%ROWTYPE;
  v_new_bal bigint;
BEGIN
  SELECT * INTO v_row
  FROM public.teacher_wallet_payhere_orders
  WHERE order_id = trim(p_order_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_row.status = 'completed'::public.teacher_wallet_topup_status THEN
    RETURN jsonb_build_object('already_completed', true, 'order_id', v_row.order_id);
  END IF;
  IF v_row.amount_cents <> p_amount_cents THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  PERFORM public.ensure_teacher_wallet(v_row.teacher_user_id);

  UPDATE public.teacher_wallets
  SET balance_cents = balance_cents + v_row.amount_cents
  WHERE teacher_user_id = v_row.teacher_user_id
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.teacher_wallet_transactions (
    teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    v_row.teacher_user_id,
    'top_up'::public.teacher_wallet_tx_kind,
    v_row.amount_cents,
    v_new_bal,
    'PayHere ' || COALESCE(NULLIF(trim(p_payment_id), ''), v_row.order_id),
    v_row.teacher_user_id
  );

  UPDATE public.teacher_wallet_payhere_orders
  SET
    status = 'completed'::public.teacher_wallet_topup_status,
    payhere_payment_id = NULLIF(trim(p_payment_id), ''),
    completed_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_teacher_wallet_payment_success(
    v_row.teacher_user_id,
    v_row.amount_cents,
    'payhere'
  );

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'balance_cents', v_new_bal,
    'amount_cents', v_row.amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_complete_payhere_order(text, text, bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.teacher_wallet_approve_manual_topup(
  p_request_id uuid,
  p_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row public.teacher_wallet_manual_topups%ROWTYPE;
  v_txn text;
  v_new_bal bigint;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_admin AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_txn := trim(COALESCE(p_transaction_id, ''));
  IF length(v_txn) < 4 THEN
    RAISE EXCEPTION 'invalid_transaction_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teacher_wallet_manual_topups m
    WHERE m.id <> p_request_id
      AND m.transaction_id IS NOT NULL
      AND lower(trim(m.transaction_id)) = lower(v_txn)
      AND m.status IN (
        'pending'::public.teacher_wallet_topup_status,
        'completed'::public.teacher_wallet_topup_status
      )
  ) THEN
    RAISE EXCEPTION 'duplicate_transaction_id';
  END IF;

  SELECT * INTO v_row
  FROM public.teacher_wallet_manual_topups
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_row.status <> 'pending'::public.teacher_wallet_topup_status THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  PERFORM public.ensure_teacher_wallet(v_row.teacher_user_id);

  UPDATE public.teacher_wallets
  SET balance_cents = balance_cents + v_row.amount_cents
  WHERE teacher_user_id = v_row.teacher_user_id
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.teacher_wallet_transactions (
    teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    v_row.teacher_user_id,
    'top_up'::public.teacher_wallet_tx_kind,
    v_row.amount_cents,
    v_new_bal,
    'Manual ' || v_txn,
    v_admin
  );

  UPDATE public.teacher_wallet_manual_topups
  SET
    transaction_id = v_txn,
    status = 'completed'::public.teacher_wallet_topup_status,
    reviewed_by = v_admin,
    reviewed_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_teacher_wallet_payment_success(
    v_row.teacher_user_id,
    v_row.amount_cents,
    'manual'
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'balance_cents', v_new_bal,
    'amount_cents', v_row.amount_cents,
    'transaction_id', v_txn
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_approve_manual_topup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_approve_manual_topup(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
