-- Teacher platform wallet (balance, top-ups, bank transfers).

-- ---------------------------------------------------------------------------
-- Wallet table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.teacher_wallets (
  teacher_user_id uuid PRIMARY KEY
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teacher_wallets IS
  'One wallet per teacher profile. Balance in cents; mutations via SECURITY DEFINER RPCs.';

CREATE OR REPLACE FUNCTION public.teacher_wallets_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_wallets_updated_at ON public.teacher_wallets;
CREATE TRIGGER teacher_wallets_updated_at
  BEFORE UPDATE ON public.teacher_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_wallets_set_updated_at();

ALTER TABLE public.teacher_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_wallets_select_own ON public.teacher_wallets;
CREATE POLICY teacher_wallets_select_own
  ON public.teacher_wallets
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT SELECT ON public.teacher_wallets TO authenticated;

-- ---------------------------------------------------------------------------
-- Transaction log
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.teacher_wallet_tx_kind AS ENUM (
    'top_up',
    'bank_transfer',
    'payment_received',
    'adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.teacher_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind public.teacher_wallet_tx_kind NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  note text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_wallet_tx_teacher_idx
  ON public.teacher_wallet_transactions (teacher_user_id, created_at DESC);

COMMENT ON TABLE public.teacher_wallet_transactions IS
  'Append-only teacher wallet ledger.';

ALTER TABLE public.teacher_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_wallet_tx_select_own ON public.teacher_wallet_transactions;
CREATE POLICY teacher_wallet_tx_select_own
  ON public.teacher_wallet_transactions
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT SELECT ON public.teacher_wallet_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_teacher_wallet(p_teacher_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.teacher_wallets (teacher_user_id)
  VALUES (p_teacher_user_id)
  ON CONFLICT (teacher_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_teacher_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_teacher_wallet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_profiles_ensure_teacher_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'teacher'::public.profile_role_v2 THEN
    INSERT INTO public.teacher_wallets (teacher_user_id)
    VALUES (NEW.id)
    ON CONFLICT (teacher_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_teacher_wallet_ins ON public.profiles;
CREATE TRIGGER profiles_ensure_teacher_wallet_ins
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_ensure_teacher_wallet();

DROP TRIGGER IF EXISTS profiles_ensure_teacher_wallet_role ON public.profiles;
CREATE TRIGGER profiles_ensure_teacher_wallet_role
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (
    NEW.role = 'teacher'::public.profile_role_v2
    AND (OLD.role IS DISTINCT FROM NEW.role)
  )
  EXECUTE FUNCTION public.trg_profiles_ensure_teacher_wallet();

INSERT INTO public.teacher_wallets (teacher_user_id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'teacher'::public.profile_role_v2
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_wallets w WHERE w.teacher_user_id = p.id
  );

CREATE OR REPLACE FUNCTION public.assert_teacher_caller()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_teacher_caller() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Overview RPC (balance + recent transactions)
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
BEGIN
  v_user := public.assert_teacher_caller();
  PERFORM public.ensure_teacher_wallet(v_user);

  SELECT w.balance_cents, w.currency
  INTO v_balance, v_currency
  FROM public.teacher_wallets w
  WHERE w.teacher_user_id = v_user;

  v_limit := GREATEST(0, LEAST(COALESCE(p_tx_limit, 50), 100));

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'kind', t.kind::text,
        'amount_cents', t.amount_cents,
        'balance_after_cents', t.balance_after_cents,
        'note', t.note,
        'created_at', t.created_at
      )
      ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_tx
  FROM (
    SELECT *
    FROM public.teacher_wallet_transactions
    WHERE teacher_user_id = v_user
    ORDER BY created_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'teacher_user_id', v_user,
    'balance_cents', COALESCE(v_balance, 0),
    'currency', COALESCE(v_currency, 'LKR'),
    'transactions', COALESCE(v_tx, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_overview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_overview(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Top-up (gateway will call this after payment; direct call for now)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_top_up(
  p_amount_cents bigint,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid;
  v_new_bal bigint;
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_amount_cents > 10000000000 THEN
    RAISE EXCEPTION 'amount_too_large';
  END IF;

  PERFORM public.ensure_teacher_wallet(v_user);

  UPDATE public.teacher_wallets
  SET balance_cents = balance_cents + p_amount_cents
  WHERE teacher_user_id = v_user
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.teacher_wallet_transactions (
    teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    v_user,
    'top_up'::public.teacher_wallet_tx_kind,
    p_amount_cents,
    v_new_bal,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user
  );

  RETURN jsonb_build_object(
    'teacher_user_id', v_user,
    'balance_cents', v_new_bal,
    'amount_cents', p_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_top_up(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_top_up(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bank transfer (debit wallet; payout processing is external)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.teacher_wallet_bank_transfer(
  p_amount_cents bigint,
  p_note text DEFAULT NULL
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
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  PERFORM public.ensure_teacher_wallet(v_user);

  SELECT balance_cents INTO v_balance
  FROM public.teacher_wallets
  WHERE teacher_user_id = v_user
  FOR UPDATE;

  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.teacher_wallets
  SET balance_cents = balance_cents - p_amount_cents
  WHERE teacher_user_id = v_user
  RETURNING balance_cents INTO v_new_bal;

  INSERT INTO public.teacher_wallet_transactions (
    teacher_user_id, kind, amount_cents, balance_after_cents, note, created_by
  )
  VALUES (
    v_user,
    'bank_transfer'::public.teacher_wallet_tx_kind,
    p_amount_cents,
    v_new_bal,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    v_user
  );

  RETURN jsonb_build_object(
    'teacher_user_id', v_user,
    'balance_cents', v_new_bal,
    'amount_cents', p_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_bank_transfer(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_bank_transfer(bigint, text) TO authenticated;
