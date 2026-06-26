-- profiles_validate_nic_format lost institute-admin exemption in 20260530120000.
-- BEFORE INSERT trigger still blocked superadmin-provisioned admins (NULL NIC).

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
       AND NOT public.profile_auth_teacher_invited(NEW.id)
       AND NOT (
         NEW.role = 'admin'::public.profile_role_v2
         AND NEW.institute_id IS NOT NULL
       ) THEN
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

NOTIFY pgrst, 'reload schema';
