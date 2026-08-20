-- Free plan default for parents; paid/trial expiry auto-downgrades to FREE (never hard-blocks).

-- 1) plan_tier on subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier text;

UPDATE public.subscriptions
SET plan_tier = CASE
  WHEN expiry_date = 'infinity'::timestamptz THEN 'paid'
  WHEN is_active = true AND expiry_date > now() THEN 'trial'
  ELSE 'free'
END
WHERE plan_tier IS NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_tier SET DEFAULT 'free';

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_tier SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_plan_tier_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_tier_check
      CHECK (plan_tier IN ('free', 'paid', 'trial'));
  END IF;
END $$;

-- 2) Allow profiles.subscription_status = 'free'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'free'));

-- 3) Ensure FREE subscription row for a parent user
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

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (p_user_id, 'free-tier', 'infinity'::timestamptz, true, 'free', now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = 'infinity'::timestamptz,
    is_active = true,
    plan_tier = 'free',
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_free_subscription_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_free_subscription_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_free_subscription_for_user(uuid) TO authenticated;

-- Keep staff helper writing plan_tier
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

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (p_user_id, 'staff-unlimited', 'infinity'::timestamptz, true, 'paid', now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = 'infinity'::timestamptz,
    is_active = true,
    plan_tier = 'paid',
    updated_at = now();
END;
$$;

-- 4) Access check: never block parents; downgrade expired paid/trial → free
CREATE OR REPLACE FUNCTION public.validate_subscription_access(p_user_id uuid, p_device_id text)
RETURNS TABLE (
  can_access boolean,
  reason text,
  expiry_date timestamptz,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_record public.subscriptions%ROWTYPE;
  v_role     public.profile_role_v2;
BEGIN
  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF public.is_designated_superadmin_user(p_user_id)
     OR public.role_has_unlimited_subscription(v_role) THEN
    PERFORM public.ensure_unlimited_subscription_for_user(p_user_id);
    RETURN QUERY SELECT true, 'ok'::text, 'infinity'::timestamptz, true;
    RETURN;
  END IF;

  SELECT *
  INTO sub_record
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.ensure_free_subscription_for_user(p_user_id);
    RETURN QUERY SELECT true, 'free'::text, 'infinity'::timestamptz, true;
    RETURN;
  END IF;

  -- Already on free tier
  IF COALESCE(sub_record.plan_tier, 'free') = 'free' THEN
    IF sub_record.is_active IS NOT TRUE
       OR sub_record.expiry_date IS DISTINCT FROM 'infinity'::timestamptz THEN
      PERFORM public.ensure_free_subscription_for_user(p_user_id);
    END IF;
    RETURN QUERY SELECT true, 'free'::text, 'infinity'::timestamptz, true;
    RETURN;
  END IF;

  -- Paid / trial expired → FREE (do not block)
  IF now() > sub_record.expiry_date THEN
    PERFORM public.ensure_free_subscription_for_user(p_user_id);
    RETURN QUERY SELECT true, 'free'::text, 'infinity'::timestamptz, true;
    RETURN;
  END IF;

  -- Active paid / trial
  IF COALESCE(sub_record.plan_tier, 'trial') = 'paid' THEN
    RETURN QUERY SELECT true, 'paid'::text, sub_record.expiry_date, true;
  ELSE
    RETURN QUERY SELECT true, 'trial'::text, sub_record.expiry_date, true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_subscription_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO authenticated;

-- 5) New users: parents default FREE; staff unlimited
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
  v_device text;
  v_teacher_invited boolean;
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

  v_nic := NULLIF(trim(COALESCE(meta->>'nic_number', '')), '');
  IF v_nic IS NOT NULL THEN
    v_nic := public.normalize_profile_nic(v_nic);
  END IF;

  IF v_nic IS NULL OR length(trim(v_nic)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id) AND NOT v_teacher_invited THEN
      RAISE EXCEPTION 'nic_required_for_registration' USING ERRCODE = '23502';
    END IF;
  END IF;

  IF public.role_has_unlimited_subscription(v_role)
     OR public.auth_user_email_matches_designated_superadmin(NEW.id) THEN
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'active';
    v_plan_tier := 'paid';
    v_device := 'staff-unlimited';
  ELSE
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'free';
    v_plan_tier := 'free';
    v_device := 'free-tier';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    trial_ends_at,
    subscription_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_expiry,
    v_sub_status
  );

  INSERT INTO public.subscriptions (
    user_id,
    device_id,
    expiry_date,
    is_active,
    plan_tier,
    updated_at
  )
  VALUES (
    NEW.id,
    v_device,
    v_expiry,
    true,
    v_plan_tier,
    now()
  );

  RETURN NEW;
END;
$$;

-- 6) Superadmin extend → paid tier with real expiry
CREATE OR REPLACE FUNCTION public.superadmin_extend_subscription(p_target_user_id uuid, p_days int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device text;
  v_new_expiry timestamptz;
  v_current_expiry timestamptz;
  v_current_tier text;
BEGIN
  PERFORM public.superadmin_assert();

  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'invalid days';
  END IF;

  SELECT COALESCE(device_id, 'superadmin-managed') INTO v_device
  FROM public.profiles
  WHERE id = p_target_user_id;

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

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, plan_tier, updated_at)
  VALUES (
    p_target_user_id,
    COALESCE(v_device, 'superadmin-managed'),
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

REVOKE ALL ON FUNCTION public.superadmin_extend_subscription(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_extend_subscription(uuid, int) TO authenticated;

-- 7) Backfill existing parents
UPDATE public.subscriptions s
SET
  plan_tier = 'free',
  is_active = true,
  expiry_date = 'infinity'::timestamptz,
  device_id = COALESCE(NULLIF(s.device_id, ''), 'free-tier'),
  updated_at = now()
FROM public.profiles p
WHERE p.id = s.user_id
  AND p.role = 'parent_student'::public.profile_role_v2
  AND (
    s.is_active IS NOT TRUE
    OR s.expiry_date <= now()
    OR COALESCE(s.plan_tier, '') = 'free'
  )
  AND NOT (
    COALESCE(s.plan_tier, '') IN ('paid', 'trial')
    AND s.is_active = true
    AND s.expiry_date > now()
    AND s.expiry_date <> 'infinity'::timestamptz
  );

UPDATE public.profiles p
SET subscription_status = 'free'
WHERE p.role = 'parent_student'::public.profile_role_v2
  AND EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p.id
      AND s.plan_tier = 'free'
  );

UPDATE public.subscriptions s
SET plan_tier = CASE
  WHEN s.expiry_date > now() AND COALESCE(s.plan_tier, 'trial') = 'paid' THEN 'paid'
  WHEN s.expiry_date > now() THEN 'trial'
  ELSE s.plan_tier
END,
updated_at = now()
FROM public.profiles p
WHERE p.id = s.user_id
  AND p.role = 'parent_student'::public.profile_role_v2
  AND s.is_active = true
  AND s.expiry_date > now()
  AND s.expiry_date <> 'infinity'::timestamptz
  AND COALESCE(s.plan_tier, '') IN ('trial', 'paid', '');

NOTIFY pgrst, 'reload schema';
