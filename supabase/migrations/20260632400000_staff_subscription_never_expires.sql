-- Staff roles (superadmin, admin, teacher) never expire; only parent_student packages expire.

CREATE OR REPLACE FUNCTION public.role_has_unlimited_subscription(p_role public.profile_role_v2)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IN (
    'superadmin'::public.profile_role_v2,
    'admin'::public.profile_role_v2,
    'teacher'::public.profile_role_v2
  );
$$;

REVOKE ALL ON FUNCTION public.role_has_unlimited_subscription(public.profile_role_v2) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_has_unlimited_subscription(public.profile_role_v2) TO authenticated;

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

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
  VALUES (p_user_id, 'staff-unlimited', 'infinity'::timestamptz, true, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    expiry_date = 'infinity'::timestamptz,
    is_active = true,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_unlimited_subscription_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_unlimited_subscription_for_user(uuid) TO service_role;

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
    RETURN QUERY SELECT false, 'not_found'::text, NULL::timestamptz, false;
    RETURN;
  END IF;

  IF now() > sub_record.expiry_date THEN
    UPDATE public.subscriptions
    SET
      is_active = false,
      updated_at = now()
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT false, 'expired'::text, sub_record.expiry_date, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, sub_record.expiry_date, sub_record.is_active;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_subscription_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO authenticated;

-- New auth users: staff get unlimited access; parent_student keeps 30-day trial.
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
  ELSE
    v_expiry := now() + interval '30 days';
    v_sub_status := 'trial';
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
    updated_at
  )
  VALUES (
    NEW.id,
    CASE
      WHEN public.role_has_unlimited_subscription(v_role) THEN 'staff-unlimited'
      ELSE 'nic-bound'
    END,
    v_expiry,
    true,
    now()
  );

  RETURN NEW;
END;
$$;

-- Existing staff accounts: remove trial expiry.
UPDATE public.profiles p
SET
  subscription_status = 'active',
  trial_ends_at = 'infinity'::timestamptz
WHERE public.role_has_unlimited_subscription(p.role)
   OR public.auth_user_email_matches_designated_superadmin(p.id);

UPDATE public.subscriptions s
SET
  expiry_date = 'infinity'::timestamptz,
  is_active = true,
  updated_at = now()
FROM public.profiles p
WHERE p.id = s.user_id
  AND (
    public.role_has_unlimited_subscription(p.role)
    OR public.auth_user_email_matches_designated_superadmin(p.id)
  );

NOTIFY pgrst, 'reload schema';
