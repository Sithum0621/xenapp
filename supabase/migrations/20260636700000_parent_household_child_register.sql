-- Parent dashboard: register additional children sharing household NIC + mobile (unique UUID / XEN ID).

CREATE OR REPLACE FUNCTION public.profile_auth_parent_household_child(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((u.raw_user_meta_data->>'parent_household_child') = 'true', false)
  FROM auth.users u
  WHERE u.id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.profile_auth_parent_household_child(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_auth_parent_household_child(uuid) TO authenticated;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_number_key;
DROP INDEX IF EXISTS public.profiles_nic_number_unique;

-- Partial unique indexes require IMMUTABLE predicates; mirror auth metadata on profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_teacher_invited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_household_child boolean NOT NULL DEFAULT false;

UPDATE public.profiles p
SET
  is_teacher_invited = COALESCE((u.raw_user_meta_data->>'teacher_invited') = 'true', false),
  is_household_child = COALESCE((u.raw_user_meta_data->>'parent_household_child') = 'true', false)
FROM auth.users u
WHERE u.id = p.id;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nic_primary_account_unique
  ON public.profiles (nic_number)
  WHERE nic_number IS NOT NULL
    AND NOT is_teacher_invited
    AND NOT is_household_child;

COMMENT ON INDEX public.profiles_nic_primary_account_unique IS
  'One primary (self-signup) account per NIC. Teacher-invited and parent household siblings may share a NIC.';

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
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id)
       AND NOT NEW.is_teacher_invited
       AND NOT NEW.is_household_child THEN
      RAISE EXCEPTION 'nic_required' USING ERRCODE = '23502';
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

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_required;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nic_required CHECK (
    (nic_number IS NOT NULL AND length(trim(nic_number)) > 0)
    OR public.auth_user_email_matches_designated_superadmin(id)
    OR is_teacher_invited
    OR is_household_child
    OR (
      role = 'admin'::public.profile_role_v2
      AND institute_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.parent_household_child_count(p_parent_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT COUNT(*)::int
      FROM public.parent_student_links l
      WHERE l.parent_user_id = p_parent_user_id
    ), 0)
    + CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = p_parent_user_id
            AND p.role = 'parent_student'::public.profile_role_v2
        ) THEN 1
        ELSE 0
      END;
$$;

REVOKE ALL ON FUNCTION public.parent_household_child_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_household_child_count(uuid) TO service_role;

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
