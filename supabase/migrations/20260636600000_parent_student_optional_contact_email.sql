-- Parent/student signup: optional contact email (auth uses synthetic phone email).

ALTER TABLE public.profiles_contact
  ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN public.profiles_contact.contact_email IS
  'Optional real contact email for parent/student accounts. Login uses auth.users synthetic phone email.';

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
  ELSE
    v_expiry := now() + interval '30 days';
    v_sub_status := 'trial';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    institute_id,
    mobile_number,
    trial_ends_at,
    subscription_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_institute,
    v_mobile_display,
    v_expiry,
    v_sub_status
  );

  IF v_contact_email IS NOT NULL THEN
    UPDATE public.profiles_contact
    SET contact_email = v_contact_email
    WHERE id = NEW.id;
  END IF;

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

NOTIFY pgrst, 'reload schema';
