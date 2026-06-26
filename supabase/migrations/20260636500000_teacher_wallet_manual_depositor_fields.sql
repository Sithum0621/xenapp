-- Manual wallet top-ups: store depositor name and ID from bank transfer slip.

ALTER TABLE public.teacher_wallet_manual_topups
  ADD COLUMN IF NOT EXISTS depositor_name text,
  ADD COLUMN IF NOT EXISTS depositor_id_number text;

DROP FUNCTION IF EXISTS public.teacher_wallet_submit_manual_topup(bigint, text, text);

CREATE OR REPLACE FUNCTION public.teacher_wallet_submit_manual_topup(
  p_amount_cents bigint,
  p_slip_path text,
  p_depositor_name text,
  p_depositor_id_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_path text;
  v_name text;
  v_depositor_id text;
  v_request_id uuid;
BEGIN
  v_user := public.assert_teacher_caller();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_path := trim(COALESCE(p_slip_path, ''));
  IF v_path = '' OR split_part(v_path, '/', 1) <> v_user::text THEN
    RAISE EXCEPTION 'invalid_slip_path';
  END IF;

  v_name := trim(COALESCE(p_depositor_name, ''));
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'invalid_depositor_name';
  END IF;

  v_depositor_id := trim(COALESCE(p_depositor_id_number, ''));
  IF length(v_depositor_id) < 4 THEN
    RAISE EXCEPTION 'invalid_depositor_id';
  END IF;

  INSERT INTO public.teacher_wallet_manual_topups (
    teacher_user_id,
    amount_cents,
    transaction_id,
    slip_path,
    depositor_name,
    depositor_id_number,
    note,
    created_by
  )
  VALUES (
    v_user,
    p_amount_cents,
    NULL,
    v_path,
    v_name,
    v_depositor_id,
    NULL,
    v_user
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'id', v_request_id,
    'status', 'pending',
    'amount_cents', p_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_submit_manual_topup(bigint, text, text, text) TO authenticated;

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
        'depositor_name', m.depositor_name,
        'depositor_id_number', m.depositor_id_number,
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

NOTIFY pgrst, 'reload schema';
