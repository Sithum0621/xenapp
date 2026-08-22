-- Phase 2 safe cleanup (data + live app preserved):
-- 1) Drop vestigial subscriptions.device_id (access check ignores it since 377).
-- 2) Point PayHere checkout phone/address reads at profiles_contact (SSOT).
-- Does NOT drop XEN columns or profiles contact mirrors (legacy fallbacks still active).

-- ---------------------------------------------------------------------------
-- subscriptions helpers (no device_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_free_subscription_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    subscription_status = 'free',
    trial_ends_at = 'infinity'::timestamptz
  WHERE id = p_user_id;

  INSERT INTO public.subscriptions (user_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (p_user_id, 'infinity'::timestamptz, true, 'free', now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = 'infinity'::timestamptz,
    is_active = true,
    plan_tier = 'free',
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_unlimited_subscription_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.profile_role_v2;
BEGIN
  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_designated_superadmin_user(p_user_id)
    OR public.role_has_unlimited_subscription(v_role)
  ) THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    subscription_status = 'active',
    trial_ends_at = 'infinity'::timestamptz
  WHERE id = p_user_id;

  INSERT INTO public.subscriptions (user_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (p_user_id, 'infinity'::timestamptz, true, 'paid', now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = 'infinity'::timestamptz,
    is_active = true,
    plan_tier = 'paid',
    updated_at = now();
END;
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

  SELECT s.expiry_date
  INTO v_current_expiry
  FROM public.subscriptions s
  WHERE s.user_id = p_student_user_id;

  IF v_current_expiry = 'infinity'::timestamptz THEN
    RETURN v_current_expiry;
  END IF;

  v_new_expiry :=
    GREATEST(COALESCE(v_current_expiry, now()), now()) + make_interval(days => v_days);

  INSERT INTO public.subscriptions (user_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (
    p_student_user_id,
    v_new_expiry,
    true,
    'paid',
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    expiry_date = EXCLUDED.expiry_date,
    is_active = true,
    plan_tier = 'paid',
    updated_at = now();

  UPDATE public.profiles
  SET
    trial_ends_at = v_new_expiry,
    subscription_status = 'active'
  WHERE id = p_student_user_id;

  RETURN v_new_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_extend_subscription(p_target_user_id uuid, p_days int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_expiry timestamptz;
  v_current_expiry timestamptz;
  v_current_tier text;
BEGIN
  PERFORM public.superadmin_assert();

  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'invalid days';
  END IF;

  SELECT s.expiry_date, s.plan_tier
  INTO v_current_expiry, v_current_tier
  FROM public.subscriptions s
  WHERE s.user_id = p_target_user_id;

  IF v_current_tier IN ('paid', 'trial')
     AND v_current_expiry IS NOT NULL
     AND v_current_expiry > now()
     AND v_current_expiry <> 'infinity'::timestamptz THEN
    v_new_expiry := v_current_expiry + make_interval(days => p_days);
  ELSE
    v_new_expiry := now() + make_interval(days => p_days);
  END IF;

  UPDATE public.profiles
  SET
    subscription_status = 'active',
    trial_ends_at = v_new_expiry
  WHERE id = p_target_user_id;

  INSERT INTO public.subscriptions (user_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (
    p_target_user_id,
    v_new_expiry,
    true,
    'paid',
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    expiry_date = EXCLUDED.expiry_date,
    is_active = true,
    plan_tier = 'paid',
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_subscription_active(p_target_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  IF public.is_designated_superadmin_user(p_target_user_id) THEN
    INSERT INTO public.subscriptions (user_id, expiry_date, is_active, updated_at)
    VALUES (
      p_target_user_id,
      'infinity'::timestamptz,
      true,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      expiry_date = 'infinity'::timestamptz,
      is_active = true,
      updated_at = now();
    RETURN;
  END IF;

  INSERT INTO public.subscriptions (user_id, expiry_date, is_active, updated_at)
  VALUES (
    p_target_user_id,
    now(),
    COALESCE(p_is_active, false),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_active = COALESCE(p_is_active, false),
    updated_at = now();
END;
$$;

-- Auth bootstrap: subscriptions row without device_id
CREATE OR REPLACE FUNCTION public.handle_auth_user_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  v_role public.profile_role_v2;
  v_full_name text;
  v_nic text;
  v_expiry timestamptz;
  v_sub_status text;
  v_plan_tier text;
  v_teacher_invited boolean;
  v_household_child boolean;
  v_institute_raw text;
  v_institute uuid;
  v_login_phone text;
  v_mobile_display text;
  v_contact_email text;
  v_phone_digits text;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  v_full_name := NULLIF(trim(COALESCE(meta->>'full_name', '')), '');

  IF meta ? 'role' AND length(trim(COALESCE(meta->>'role', ''))) > 0 THEN
    BEGIN
      v_role := trim(meta->>'role')::public.profile_role_v2;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_role := 'parent_student'::public.profile_role_v2;
    END;
  ELSE
    v_role := 'parent_student'::public.profile_role_v2;
  END IF;

  v_teacher_invited := COALESCE(meta->>'teacher_invited', '') = 'true';
  v_household_child := COALESCE(meta->>'parent_household_child', '') = 'true';

  v_institute_raw := NULLIF(trim(COALESCE(meta->>'institute_id', '')), '');
  v_institute := NULL;
  IF v_institute_raw IS NOT NULL THEN
    BEGIN
      v_institute := v_institute_raw::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_institute := NULL;
    END;
  END IF;

  IF v_role = 'admin'::public.profile_role_v2 AND v_institute IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute) THEN
      RAISE EXCEPTION 'institute_not_found_for_admin_provision' USING ERRCODE = '23503';
    END IF;
  ELSE
    v_institute := NULL;
  END IF;

  v_nic := NULLIF(trim(COALESCE(meta->>'nic_number', '')), '');
  IF v_nic IS NOT NULL THEN
    v_nic := public.normalize_profile_nic(v_nic);
  END IF;

  IF v_nic IS NULL OR length(trim(v_nic)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id)
       AND NOT v_teacher_invited
       AND NOT v_household_child
       AND NOT (
         v_role = 'admin'::public.profile_role_v2
         AND v_institute IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'nic_required_for_registration' USING ERRCODE = '23502';
    END IF;
  END IF;

  v_login_phone := NULLIF(trim(COALESCE(meta->>'login_phone', '')), '');
  v_mobile_display := NULL;
  IF v_login_phone IS NOT NULL THEN
    v_phone_digits := regexp_replace(v_login_phone, '[^0-9]', '', 'g');
    IF v_phone_digits LIKE '94%' AND length(v_phone_digits) >= 11 THEN
      v_phone_digits := substring(v_phone_digits from 3);
    ELSIF v_phone_digits LIKE '0%' THEN
      v_phone_digits := substring(v_phone_digits from 2);
    END IF;
    IF length(v_phone_digits) = 9 AND v_phone_digits LIKE '7%' THEN
      v_mobile_display := '0' || v_phone_digits;
    END IF;
  END IF;

  v_contact_email := NULLIF(lower(trim(COALESCE(meta->>'contact_email', ''))), '');

  IF public.role_has_unlimited_subscription(v_role)
     OR public.auth_user_email_matches_designated_superadmin(NEW.id) THEN
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'active';
    v_plan_tier := 'paid';
  ELSIF v_teacher_invited OR v_household_child THEN
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'free';
    v_plan_tier := 'free';
  ELSE
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'free';
    v_plan_tier := 'free';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    institute_id,
    mobile_number,
    trial_ends_at,
    subscription_status,
    is_teacher_invited,
    is_household_child
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_institute,
    v_mobile_display,
    v_expiry,
    v_sub_status,
    v_teacher_invited,
    v_household_child
  );

  IF v_contact_email IS NOT NULL OR v_login_phone IS NOT NULL THEN
    INSERT INTO public.profiles_contact AS pc (id, mobile_number, contact_email)
    VALUES (
      NEW.id,
      COALESCE(v_login_phone, v_mobile_display),
      v_contact_email
    )
    ON CONFLICT (id) DO UPDATE
    SET
      mobile_number = COALESCE(EXCLUDED.mobile_number, pc.mobile_number),
      contact_email = COALESCE(EXCLUDED.contact_email, pc.contact_email);
  END IF;

  INSERT INTO public.subscriptions (
    user_id,
    expiry_date,
    is_active,
    plan_tier,
    updated_at
  )
  VALUES (
    NEW.id,
    v_expiry,
    true,
    v_plan_tier,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = EXCLUDED.expiry_date,
    is_active = true,
    plan_tier = EXCLUDED.plan_tier,
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'auth_profile_bootstrap_failed: %', SQLERRM
      USING ERRCODE = SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.validate_subscription_access(uuid, text) IS
  'Subscription gate. p_device_id is ignored (legacy param kept for client compat).';

-- PayHere checkout: read phone/address from profiles_contact (fallback profiles mirror)
CREATE OR REPLACE FUNCTION public.teacher_wallet_payhere_checkout_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.teacher_wallet_payhere_orders%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_contact public.profiles_contact%ROWTYPE;
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
  SELECT * INTO v_contact FROM public.profiles_contact WHERE id = v_row.teacher_user_id;

  RETURN jsonb_build_object(
    'order_id', v_row.order_id,
    'amount_cents', v_row.amount_cents,
    'teacher_user_id', v_row.teacher_user_id,
    'first_name', COALESCE(NULLIF(trim(v_profile.first_name), ''), split_part(COALESCE(v_profile.full_name, ''), ' ', 1), 'Teacher'),
    'last_name', COALESCE(NULLIF(trim(v_profile.last_name), ''), NULLIF(trim(substring(COALESCE(v_profile.full_name, '') FROM position(' ' IN COALESCE(v_profile.full_name, '')) + 1)), ''), ''),
    'email', COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_row.teacher_user_id), 'teacher@xen.lk'),
    'phone', COALESCE(
      NULLIF(trim(v_contact.mobile_number), ''),
      NULLIF(trim(v_profile.mobile_number), ''),
      '0770000000'
    ),
    'address', COALESCE(
      NULLIF(trim(v_contact.address), ''),
      NULLIF(trim(v_profile.address), ''),
      'Colombo'
    )
  );
END;
$$;

DROP INDEX IF EXISTS public.subscriptions_device_id_idx;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS device_id;

NOTIFY pgrst, 'reload schema';
