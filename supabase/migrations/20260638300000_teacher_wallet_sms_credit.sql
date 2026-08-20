-- Debit teacher wallet to buy SMS credits (Rs. 1 = 1 credit).

CREATE OR REPLACE FUNCTION public.teacher_wallet_spend_sms_credits(
  p_credits bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid;
  v_balance   bigint;
  v_new_bal   bigint;
  v_amount    bigint;
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- 1 credit = Rs. 1 = 100 cents.
  v_amount := p_credits * 100;

  PERFORM public.ensure_teacher_wallet(v_user);

  SELECT balance_cents INTO v_balance
  FROM public.teacher_wallets
  WHERE teacher_user_id = v_user
  FOR UPDATE;

  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.teacher_wallets
  SET balance_cents = balance_cents - v_amount
  WHERE teacher_user_id = v_user
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.teacher_wallet_transactions (
    teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    v_user,
    'adjustment'::public.teacher_wallet_tx_kind,
    v_amount,
    v_new_bal,
    'SMS credit purchase (' || p_credits::text || ' credits)',
    v_user
  );

  RETURN jsonb_build_object(
    'teacher_user_id', v_user,
    'balance_cents', v_new_bal,
    'amount_cents', v_amount,
    'credits', p_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_spend_sms_credits(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_spend_sms_credits(bigint) TO authenticated;
