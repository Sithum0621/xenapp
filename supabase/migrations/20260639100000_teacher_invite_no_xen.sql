-- Teacher-invited students: no XEN ID allocation.
-- Fix auth.users insert trigger so admin createUser no longer fails with
-- "Database error creating new user" for teacher_invited accounts.

-- 1) Stop allocating XEN IDs (keep columns for legacy rows; return NULL).
CREATE OR REPLACE FUNCTION public.allocate_xen_student_id(p_student_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
BEGIN
  SELECT NULLIF(trim(p.xen_student_id), '')
  INTO v_existing
  FROM public.profiles p
  WHERE p.id = p_student_user_id;

  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_xen_student_id(p_student_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.allocate_xen_student_id(p_student_user_id);
END;
$$;

COMMENT ON FUNCTION public.allocate_xen_student_id(uuid) IS
  'Legacy no-op: returns existing xen_student_id if any; never allocates new IDs.';
COMMENT ON FUNCTION public.ensure_xen_student_id(uuid) IS
  'Legacy no-op: returns existing xen_student_id if any; never allocates new IDs.';

-- 2) Allow free subscription status (idempotent).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'free'));

-- 3) Auth trigger: teacher_invited / household child without NIC or XEN.
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
    v_device := 'staff-unlimited';
  ELSIF v_teacher_invited OR v_household_child THEN
    v_expiry := 'infinity'::timestamptz;
    v_sub_status := 'free';
    v_plan_tier := 'free';
    v_device := 'free-tier';
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
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    device_id = EXCLUDED.device_id,
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

NOTIFY pgrst, 'reload schema';
