-- Normalize NIC rules: UNIQUE values; mandatory on every profile except designated platform admin Auth email.

CREATE OR REPLACE FUNCTION public.auth_user_email_matches_designated_superadmin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_user_id
      AND lower(trim(u.email::text)) = lower(trim('sithumpriyashan12@gmail.com'))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_email_matches_designated_superadmin(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE (p.nic_number IS NULL OR length(trim(p.nic_number)) = 0)
      AND NOT public.auth_user_email_matches_designated_superadmin(p.id)
  ) THEN
    RAISE EXCEPTION 'profiles_nic_migration_blocked: non-designated profiles missing nic_number — fix rows before migrating';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT public.normalize_profile_nic(nic_number) AS n
      FROM public.profiles
      WHERE nic_number IS NOT NULL AND length(trim(nic_number)) > 0
      GROUP BY 1
      HAVING count(*) > 1
    ) dup
  ) THEN
    RAISE EXCEPTION 'profiles_nic_migration_blocked: duplicate NIC values — dedupe before migrating';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.profiles_nic_number_unique;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_number_key;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nic_number_key UNIQUE (nic_number);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_required;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nic_required CHECK (
    (nic_number IS NOT NULL AND length(trim(nic_number)) > 0)
    OR public.auth_user_email_matches_designated_superadmin(id)
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

  v_nic := NULLIF(trim(COALESCE(meta->>'nic_number', '')), '');
  IF v_nic IS NOT NULL THEN
    v_nic := public.normalize_profile_nic(v_nic);
  END IF;

  IF v_nic IS NULL OR length(trim(v_nic)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id) THEN
      RAISE EXCEPTION 'nic_required_for_registration' USING ERRCODE = '23502';
    END IF;
  END IF;

  v_trial_end := now() + interval '30 days';

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
