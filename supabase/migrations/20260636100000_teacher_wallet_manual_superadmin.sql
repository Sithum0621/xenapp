-- Manual wallet top-ups: teacher submits slip only; superadmin enters transaction ID on approve.

ALTER TABLE public.teacher_wallet_manual_topups
  ALTER COLUMN transaction_id DROP NOT NULL;

DROP INDEX IF EXISTS public.teacher_wallet_manual_topups_txn_unique;

CREATE UNIQUE INDEX IF NOT EXISTS teacher_wallet_manual_topups_txn_unique
  ON public.teacher_wallet_manual_topups (lower(trim(transaction_id)))
  WHERE transaction_id IS NOT NULL
    AND length(trim(transaction_id)) >= 4
    AND status IN (
      'pending'::public.teacher_wallet_topup_status,
      'completed'::public.teacher_wallet_topup_status
    );

DROP POLICY IF EXISTS teacher_wallet_slips_select_superadmin ON storage.objects;
CREATE POLICY teacher_wallet_slips_select_superadmin
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'teacher-wallet-slips'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

DROP FUNCTION IF EXISTS public.teacher_wallet_submit_manual_topup(bigint, text, text, text);

CREATE OR REPLACE FUNCTION public.teacher_wallet_submit_manual_topup(
  p_amount_cents bigint,
  p_slip_path text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_path text;
  v_id uuid;
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_path := trim(COALESCE(p_slip_path, ''));
  IF v_path = '' OR split_part(v_path, '/', 1) <> v_user::text THEN
    RAISE EXCEPTION 'invalid_slip_path';
  END IF;

  INSERT INTO public.teacher_wallet_manual_topups (
    teacher_user_id, amount_cents, transaction_id, slip_path, note, created_by
  )
  VALUES (
    v_user,
    p_amount_cents,
    NULL,
    v_path,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'amount_cents', p_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.teacher_wallet_approve_manual_topup(uuid);

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

CREATE OR REPLACE FUNCTION public.teacher_wallet_reject_manual_topup(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row public.teacher_wallet_manual_topups%ROWTYPE;
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

  UPDATE public.teacher_wallet_manual_topups
  SET
    status = 'cancelled'::public.teacher_wallet_topup_status,
    note = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), v_row.note),
    reviewed_by = v_admin,
    reviewed_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('id', v_row.id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_reject_manual_topup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_reject_manual_topup(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_count_pending_teacher_wallet_topups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_count integer;
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

  SELECT count(*)::integer INTO v_count
  FROM public.teacher_wallet_manual_topups m
  WHERE m.status = 'pending'::public.teacher_wallet_topup_status;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_count_pending_teacher_wallet_topups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_count_pending_teacher_wallet_topups() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_teacher_wallet_manual_topups(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_limit integer;
  v_items jsonb;
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

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));

  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY sort_at DESC),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', m.id,
        'teacher_user_id', m.teacher_user_id,
        'teacher_name', COALESCE(
          NULLIF(trim(p.full_name), ''),
          NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
          'Teacher'
        ),
        'teacher_email', COALESCE(u.email, ''),
        'amount_cents', m.amount_cents,
        'slip_path', m.slip_path,
        'note', m.note,
        'created_at', m.created_at
      ) AS row_data,
      m.created_at AS sort_at
    FROM public.teacher_wallet_manual_topups m
    JOIN public.profiles p ON p.id = m.teacher_user_id
    LEFT JOIN auth.users u ON u.id = m.teacher_user_id
    WHERE m.status = 'pending'::public.teacher_wallet_topup_status
    ORDER BY m.created_at DESC
    LIMIT v_limit
  ) raw;

  RETURN jsonb_build_object('items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_teacher_wallet_manual_topups(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_teacher_wallet_manual_topups(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_wallet_overview(p_tx_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_limit integer;
  v_balance bigint;
  v_currency text;
  v_tx jsonb;
BEGIN
  v_user := public.assert_teacher_caller();
  PERFORM public.ensure_teacher_wallet(v_user);

  SELECT w.balance_cents, w.currency
  INTO v_balance, v_currency
  FROM public.teacher_wallets w
  WHERE w.teacher_user_id = v_user;

  v_limit := GREATEST(0, LEAST(COALESCE(p_tx_limit, 50), 100));

  SELECT COALESCE(
    jsonb_agg(f.row_data ORDER BY f.sort_at DESC),
    '[]'::jsonb
  )
  INTO v_tx
  FROM (
    SELECT row_data, sort_at
    FROM (
      SELECT
        jsonb_build_object(
          'id', t.id::text,
          'kind', t.kind::text,
          'amount_cents', t.amount_cents,
          'balance_after_cents', t.balance_after_cents,
          'note', t.note,
          'created_at', t.created_at,
          'status', 'completed',
          'method', NULL
        ) AS row_data,
        t.created_at AS sort_at
      FROM public.teacher_wallet_transactions t
      WHERE t.teacher_user_id = v_user

      UNION ALL

      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'kind', 'top_up',
          'amount_cents', m.amount_cents,
          'balance_after_cents', NULL,
          'note', m.note,
          'created_at', m.created_at,
          'status', 'pending',
          'method', 'manual'
        ),
        m.created_at
      FROM public.teacher_wallet_manual_topups m
      WHERE m.teacher_user_id = v_user
        AND m.status = 'pending'::public.teacher_wallet_topup_status

      UNION ALL

      SELECT
        jsonb_build_object(
          'id', o.id::text,
          'kind', 'top_up',
          'amount_cents', o.amount_cents,
          'balance_after_cents', NULL,
          'note', o.order_id,
          'created_at', o.created_at,
          'status', 'pending',
          'method', 'payhere'
        ),
        o.created_at
      FROM public.teacher_wallet_payhere_orders o
      WHERE o.teacher_user_id = v_user
        AND o.status = 'pending'::public.teacher_wallet_topup_status
    ) raw
    ORDER BY sort_at DESC
    LIMIT v_limit
  ) f;

  RETURN jsonb_build_object(
    'teacher_user_id', v_user,
    'balance_cents', COALESCE(v_balance, 0),
    'currency', COALESCE(v_currency, 'LKR'),
    'transactions', COALESCE(v_tx, '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
