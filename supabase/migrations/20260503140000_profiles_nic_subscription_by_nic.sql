-- NIC-based signup identity and free-trial eligibility; drop device-bound access checks.

CREATE OR REPLACE FUNCTION public.normalize_profile_nic(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    ELSE upper(regexp_replace(trim(raw), '\s+', '', 'g'))
  END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nic_number text;

UPDATE public.profiles
SET nic_number = public.normalize_profile_nic(nic_number)
WHERE nic_number IS NOT NULL AND length(trim(nic_number)) > 0;

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

DROP TRIGGER IF EXISTS profiles_nic_format_guard ON public.profiles;
CREATE TRIGGER profiles_nic_format_guard
BEFORE INSERT OR UPDATE OF nic_number ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_validate_nic_format();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nic_number_unique
ON public.profiles (nic_number)
WHERE nic_number IS NOT NULL;

-- True if this NIC is not yet tied to any profile (signup + first free trial allowed).
CREATE OR REPLACE FUNCTION public.signup_nic_available(p_nic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  IF p_nic IS NULL OR length(trim(p_nic)) = 0 THEN
    RETURN false;
  END IF;

  n := public.normalize_profile_nic(p_nic);

  IF NOT (
    (length(n) = 12 AND n ~ '^[0-9]{12}$')
    OR (length(n) = 10 AND n ~ '^[0-9]{9}[VX]$')
  ) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.nic_number IS NOT NULL
      AND public.normalize_profile_nic(p.nic_number) = n
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_nic_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_nic_available(text) TO anon;
GRANT EXECUTE ON FUNCTION public.signup_nic_available(text) TO authenticated;

-- Device-based trial RPC no longer used by the app (kept dropped to avoid misuse).
DROP FUNCTION IF EXISTS public.has_used_device_trial(text);

-- Cold-start helper: do not steer users by device anymore.
CREATE OR REPLACE FUNCTION public.device_has_registered_profile(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false;
$$;

REVOKE ALL ON FUNCTION public.device_has_registered_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_has_registered_profile(text) TO anon;
GRANT EXECUTE ON FUNCTION public.device_has_registered_profile(text) TO authenticated;

-- Subscription access no longer depends on device_id matching the client.
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
BEGIN
  IF public.is_designated_superadmin_user(p_user_id) THEN
    UPDATE public.subscriptions
    SET
      is_active = true,
      expiry_date = 'infinity'::timestamptz,
      updated_at = now()
    WHERE user_id = p_user_id;

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
