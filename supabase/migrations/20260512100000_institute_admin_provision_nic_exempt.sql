-- Allow superadmin-provisioned institute admins (role admin + institute_id) without NIC.
-- Auth trigger reads optional institute_id from user_metadata for trusted provisioning only.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_required;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nic_required CHECK (
    (nic_number IS NOT NULL AND length(trim(nic_number)) > 0)
    OR public.auth_user_email_matches_designated_superadmin(id)
    OR (
      role = 'admin'::public.profile_role_v2
      AND institute_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.profiles_validate_nic_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  IF NEW.nic_number IS NULL OR length(trim(NEW.nic_number)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id) THEN
      IF NOT (
        NEW.role = 'admin'::public.profile_role_v2
        AND NEW.institute_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'nic_required' USING ERRCODE = '23502';
      END IF;
    END IF;
    NEW.nic_number := NULL;
    RETURN NEW;
  END IF;

  n := public.normalize_profile_nic(NEW.nic_number);

  IF NOT (
    (length(n) = 12 AND n ~ '^[0-9]{12}$')
    OR (length(n) = 10 AND n ~ '^[0-9]{9}[VX]$')
  ) THEN
    RAISE EXCEPTION 'invalid_nic_format' USING ERRCODE = 'check_violation';
  END IF;

  NEW.nic_number := n;
  RETURN NEW;
END;
$$;

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
  v_trial_end timestamptz;
  v_institute_raw text;
  v_institute uuid;
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
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id) THEN
      IF NOT (
        v_role = 'admin'::public.profile_role_v2
        AND v_institute IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'nic_required_for_registration' USING ERRCODE = '23502';
      END IF;
    END IF;
  END IF;

  v_trial_end := now() + interval '30 days';

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    institute_id,
    trial_ends_at,
    subscription_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_institute,
    v_trial_end,
    'trial'
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
    'nic-bound',
    v_trial_end,
    true,
    now()
  );

  RETURN NEW;
END;
$$;
