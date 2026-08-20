-- Teacher SMS accounts: starter 50 credits, per-channel SMS toggles.
-- Push notifications stay independent (always sent). SMS stops at 0 credits.

CREATE TABLE IF NOT EXISTS public.teacher_sms_accounts (
  teacher_user_id uuid PRIMARY KEY
    REFERENCES public.profiles (id) ON DELETE CASCADE,
  sms_name text NOT NULL,
  credit_balance integer NOT NULL DEFAULT 50 CHECK (credit_balance >= 0),
  attendance_sms_enabled boolean NOT NULL DEFAULT true,
  payments_sms_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.teacher_sms_accounts IS
  'Teacher SMS sender name, credit balance (1 SMS = 1 credit = Rs. 1), and channel toggles.';

CREATE OR REPLACE FUNCTION public.teacher_sms_accounts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_sms_accounts_updated_at ON public.teacher_sms_accounts;
CREATE TRIGGER teacher_sms_accounts_updated_at
  BEFORE UPDATE ON public.teacher_sms_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.teacher_sms_accounts_set_updated_at();

ALTER TABLE public.teacher_sms_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_sms_accounts_select_own ON public.teacher_sms_accounts;
CREATE POLICY teacher_sms_accounts_select_own
  ON public.teacher_sms_accounts
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT SELECT ON public.teacher_sms_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_sms_get_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_row public.teacher_sms_accounts%ROWTYPE;
BEGIN
  v_user := public.assert_teacher_caller();
  SELECT * INTO v_row
  FROM public.teacher_sms_accounts
  WHERE teacher_user_id = v_user;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'teacher_user_id', v_row.teacher_user_id,
    'sms_name', v_row.sms_name,
    'credit_balance', v_row.credit_balance,
    'attendance_sms_enabled', v_row.attendance_sms_enabled,
    'payments_sms_enabled', v_row.payments_sms_enabled,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_get_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_get_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_sms_create_account(p_sms_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_name text := NULLIF(trim(COALESCE(p_sms_name, '')), '');
  v_row public.teacher_sms_accounts%ROWTYPE;
BEGIN
  v_user := public.assert_teacher_caller();
  IF v_name IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'sms_name_required';
  END IF;

  INSERT INTO public.teacher_sms_accounts (teacher_user_id, sms_name, credit_balance)
  VALUES (v_user, v_name, 50)
  ON CONFLICT (teacher_user_id) DO UPDATE
    SET sms_name = EXCLUDED.sms_name
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'teacher_user_id', v_row.teacher_user_id,
    'sms_name', v_row.sms_name,
    'credit_balance', v_row.credit_balance,
    'attendance_sms_enabled', v_row.attendance_sms_enabled,
    'payments_sms_enabled', v_row.payments_sms_enabled,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_create_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_create_account(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_sms_set_channels(
  p_attendance_enabled boolean,
  p_payments_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_row public.teacher_sms_accounts%ROWTYPE;
BEGIN
  v_user := public.assert_teacher_caller();
  UPDATE public.teacher_sms_accounts
  SET
    attendance_sms_enabled = COALESCE(p_attendance_enabled, attendance_sms_enabled),
    payments_sms_enabled = COALESCE(p_payments_enabled, payments_sms_enabled)
  WHERE teacher_user_id = v_user
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sms_account_missing';
  END IF;
  RETURN jsonb_build_object(
    'teacher_user_id', v_row.teacher_user_id,
    'sms_name', v_row.sms_name,
    'credit_balance', v_row.credit_balance,
    'attendance_sms_enabled', v_row.attendance_sms_enabled,
    'payments_sms_enabled', v_row.payments_sms_enabled,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_set_channels(boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_set_channels(boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_sms_add_credits(p_credits integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_row public.teacher_sms_accounts%ROWTYPE;
BEGIN
  v_user := public.assert_teacher_caller();
  IF p_credits IS NULL OR p_credits <= 0 OR p_credits > 100000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  UPDATE public.teacher_sms_accounts
  SET credit_balance = credit_balance + p_credits
  WHERE teacher_user_id = v_user
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sms_account_missing';
  END IF;
  RETURN jsonb_build_object(
    'teacher_user_id', v_row.teacher_user_id,
    'sms_name', v_row.sms_name,
    'credit_balance', v_row.credit_balance,
    'attendance_sms_enabled', v_row.attendance_sms_enabled,
    'payments_sms_enabled', v_row.payments_sms_enabled,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_add_credits(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_add_credits(integer) TO authenticated;

-- Service-role only: reserve 1 credit before sending SMS.
CREATE OR REPLACE FUNCTION public.teacher_sms_consume_credit(p_teacher_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_teacher_user_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.teacher_sms_accounts
  SET credit_balance = credit_balance - 1
  WHERE teacher_user_id = p_teacher_user_id
    AND credit_balance > 0
  RETURNING 1 INTO v_updated;
  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_consume_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_consume_credit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.teacher_sms_refund_credit(p_teacher_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_teacher_user_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.teacher_sms_accounts
  SET credit_balance = credit_balance + 1
  WHERE teacher_user_id = p_teacher_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_sms_refund_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_sms_refund_credit(uuid) TO service_role;

-- Tag attendance / payment pushes with the teacher so SMS can follow the same event.
CREATE OR REPLACE FUNCTION public.notify_attendance_marked(
  p_student_user_id uuid,
  p_group_id        uuid,
  p_group_source    text,
  p_group_name      text,
  p_schedule_id     uuid,
  p_session_id      uuid,
  p_session_date    date,
  p_class_label     text,
  p_marked_at       time
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name  text;
  v_mark_label    text;
  v_date_label    text;
  v_parent_id     uuid;
  v_count         int := 0;
  v_parent_title  text := 'Attendance recorded';
  v_student_title text := 'Attendance recorded';
  v_parent_body   text;
  v_student_body  text;
  v_data          jsonb;
  v_teacher       uuid := auth.uid();
BEGIN
  IF p_student_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(nullif(trim(p.full_name), ''), 'Student')
  INTO v_student_name
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  v_mark_label := trim(to_char(p_marked_at, 'FMHH12:MI AM'));
  v_date_label := to_char(p_session_date, 'FMMon DD, YYYY');

  v_parent_body := format(
    '%s was marked present at %s on %s for %s (class %s).',
    v_student_name,
    v_mark_label,
    v_date_label,
    coalesce(nullif(trim(p_group_name), ''), 'class'),
    coalesce(nullif(trim(p_class_label), ''), '—')
  );

  v_student_body := format(
    'Hi %s, your attendance was recorded at %s on %s for %s (class %s).',
    v_student_name,
    v_mark_label,
    v_date_label,
    coalesce(nullif(trim(p_group_name), ''), 'class'),
    coalesce(nullif(trim(p_class_label), ''), '—')
  );

  v_data := jsonb_build_object(
    'type', 'attendance_marked',
    'student_user_id', p_student_user_id,
    'student_name', v_student_name,
    'group_id', p_group_id,
    'group_source', p_group_source,
    'group_name', p_group_name,
    'schedule_id', p_schedule_id,
    'session_id', p_session_id,
    'session_date', p_session_date::text,
    'class_label', p_class_label,
    'marked_at', v_mark_label,
    'teacher_user_id', v_teacher,
    'route', '/parent-dashboard/attendance'
  );

  FOR v_parent_id IN
    SELECT psl.parent_user_id
    FROM public.parent_student_links psl
    WHERE psl.student_user_id = p_student_user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (v_parent_id, v_parent_title, v_parent_body, v_data);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (p_student_user_id, v_student_title, v_student_body, v_data);
  v_count := v_count + 1;

  RETURN v_count;
END;
$$;

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
  v_teacher uuid := auth.uid();
  v_data jsonb;
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

  v_data := jsonb_build_object(
    'type', 'class_fee_paid',
    'student_user_id', p_student_user_id,
    'group_name', p_group_name,
    'amount_cents', p_amount_cents,
    'billing_month', p_billing_month,
    'teacher_user_id', v_teacher,
    'route', '/parent-dashboard/classes'
  );

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
    v_data
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
      v_data
    );
  END LOOP;
END;
$$;
