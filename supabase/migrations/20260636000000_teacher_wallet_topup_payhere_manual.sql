-- Teacher wallet top-ups: PayHere orders + manual bank-transfer slips.

-- ---------------------------------------------------------------------------
-- Status enum
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.teacher_wallet_topup_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- PayHere orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_wallet_payhere_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  order_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  checkout_token uuid NOT NULL DEFAULT gen_random_uuid(),
  checkout_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  status public.teacher_wallet_topup_status NOT NULL DEFAULT 'pending',
  payhere_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT teacher_wallet_payhere_orders_order_id_key UNIQUE (order_id),
  CONSTRAINT teacher_wallet_payhere_orders_checkout_token_key UNIQUE (checkout_token)
);

CREATE INDEX IF NOT EXISTS teacher_wallet_payhere_orders_teacher_idx
  ON public.teacher_wallet_payhere_orders (teacher_user_id, created_at DESC);

ALTER TABLE public.teacher_wallet_payhere_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_wallet_payhere_orders_select_own ON public.teacher_wallet_payhere_orders;
CREATE POLICY teacher_wallet_payhere_orders_select_own
  ON public.teacher_wallet_payhere_orders
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT SELECT ON public.teacher_wallet_payhere_orders TO authenticated;

-- ---------------------------------------------------------------------------
-- Manual top-up requests (bank transfer + slip)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_wallet_manual_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  transaction_id text NOT NULL,
  slip_path text NOT NULL,
  status public.teacher_wallet_topup_status NOT NULL DEFAULT 'pending',
  note text,
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS teacher_wallet_manual_topups_teacher_idx
  ON public.teacher_wallet_manual_topups (teacher_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_wallet_manual_topups_txn_unique
  ON public.teacher_wallet_manual_topups (teacher_user_id, lower(trim(transaction_id)))
  WHERE status = 'pending'::public.teacher_wallet_topup_status;

ALTER TABLE public.teacher_wallet_manual_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_wallet_manual_topups_select_own ON public.teacher_wallet_manual_topups;
CREATE POLICY teacher_wallet_manual_topups_select_own
  ON public.teacher_wallet_manual_topups
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT SELECT ON public.teacher_wallet_manual_topups TO authenticated;

-- ---------------------------------------------------------------------------
-- Slip storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'teacher-wallet-slips',
  'teacher-wallet-slips',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS teacher_wallet_slips_insert_own ON storage.objects;
CREATE POLICY teacher_wallet_slips_insert_own
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'teacher-wallet-slips'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS teacher_wallet_slips_select_own ON storage.objects;
CREATE POLICY teacher_wallet_slips_select_own
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'teacher-wallet-slips'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Create PayHere order (called from edge function with service role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_create_payhere_order(
  p_teacher_user_id uuid,
  p_amount_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id text;
  v_token uuid;
  v_row public.teacher_wallet_payhere_orders%ROWTYPE;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_amount_cents > 10000000000 THEN
    RAISE EXCEPTION 'amount_too_large';
  END IF;

  PERFORM public.ensure_teacher_wallet(p_teacher_user_id);

  v_order_id := 'XEN-TW-' || replace(gen_random_uuid()::text, '-', '');
  v_token := gen_random_uuid();

  INSERT INTO public.teacher_wallet_payhere_orders (
    teacher_user_id, order_id, amount_cents, checkout_token, status
  )
  VALUES (
    p_teacher_user_id, v_order_id, p_amount_cents, v_token, 'pending'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'order_id', v_row.order_id,
    'amount_cents', v_row.amount_cents,
    'checkout_token', v_row.checkout_token,
    'checkout_expires_at', v_row.checkout_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_create_payhere_order(uuid, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Load checkout session by token (edge function)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_payhere_checkout_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.teacher_wallet_payhere_orders%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.teacher_wallet_payhere_orders
  WHERE checkout_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_row.status <> 'pending'::public.teacher_wallet_topup_status THEN
    RAISE EXCEPTION 'order_not_pending';
  END IF;
  IF v_row.checkout_expires_at < now() THEN
    RAISE EXCEPTION 'checkout_expired';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_row.teacher_user_id;

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'amount_cents', v_row.amount_cents,
    'teacher_user_id', v_row.teacher_user_id,
    'first_name', COALESCE(NULLIF(trim(v_profile.first_name), ''), split_part(COALESCE(v_profile.full_name, ''), ' ', 1), 'Teacher'),
    'last_name', COALESCE(NULLIF(trim(v_profile.last_name), ''), NULLIF(trim(substring(COALESCE(v_profile.full_name, '') FROM position(' ' IN COALESCE(v_profile.full_name, '')) + 1)), ''), ''),
    'email', COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_row.teacher_user_id), 'teacher@xen.lk'),
    'phone', COALESCE(NULLIF(trim(v_profile.mobile_number), ''), '0770000000'),
    'address', COALESCE(NULLIF(trim(v_profile.address), ''), 'Colombo')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_payhere_checkout_by_token(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Complete PayHere order (edge function notify webhook)
-- ---------------------------------------------------------------------------

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

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'balance_cents', v_new_bal,
    'amount_cents', v_row.amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_complete_payhere_order(text, text, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Manual top-up submit (teacher)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_submit_manual_topup(
  p_amount_cents bigint,
  p_transaction_id text,
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
  v_txn text;
  v_path text;
  v_id uuid;
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_txn := trim(COALESCE(p_transaction_id, ''));
  IF length(v_txn) < 4 THEN
    RAISE EXCEPTION 'invalid_transaction_id';
  END IF;

  v_path := trim(COALESCE(p_slip_path, ''));
  IF v_path = '' OR split_part(v_path, '/', 1) <> v_user::text THEN
    RAISE EXCEPTION 'invalid_slip_path';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teacher_wallet_manual_topups m
    WHERE m.teacher_user_id = v_user
      AND lower(trim(m.transaction_id)) = lower(v_txn)
      AND m.status = 'pending'::public.teacher_wallet_topup_status
  ) THEN
    RAISE EXCEPTION 'duplicate_transaction_id';
  END IF;

  INSERT INTO public.teacher_wallet_manual_topups (
    teacher_user_id, amount_cents, transaction_id, slip_path, note, created_by
  )
  VALUES (
    v_user,
    p_amount_cents,
    v_txn,
    v_path,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'status', 'pending',
    'amount_cents', p_amount_cents,
    'transaction_id', v_txn
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Approve manual top-up (superadmin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_approve_manual_topup(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_row public.teacher_wallet_manual_topups%ROWTYPE;
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
    'Manual ' || v_row.transaction_id,
    v_admin
  );

  UPDATE public.teacher_wallet_manual_topups
  SET
    status = 'completed'::public.teacher_wallet_topup_status,
    reviewed_by = v_admin,
    reviewed_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'balance_cents', v_new_bal,
    'amount_cents', v_row.amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_approve_manual_topup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_approve_manual_topup(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Overview: include pending top-ups in feed
-- ---------------------------------------------------------------------------

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
  v_pending jsonb;
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
          'note', m.transaction_id,
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

-- Block direct wallet credit from app (PayHere webhook / admin approval only)
REVOKE EXECUTE ON FUNCTION public.teacher_wallet_top_up(bigint, text) FROM authenticated;

NOTIFY pgrst, 'reload schema';
