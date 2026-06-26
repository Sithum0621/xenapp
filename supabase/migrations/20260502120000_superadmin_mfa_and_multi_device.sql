-- MFA pending login (tokens encrypted server-side until OTP verified).
CREATE TABLE IF NOT EXISTS public.superadmin_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  refresh_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superadmin_mfa_challenges_user_id_idx ON public.superadmin_mfa_challenges (user_id);
CREATE INDEX IF NOT EXISTS superadmin_mfa_challenges_expires_at_idx ON public.superadmin_mfa_challenges (expires_at);

ALTER TABLE public.superadmin_mfa_challenges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.superadmin_mfa_challenges IS 'Short-lived MFA challenges for designated superadmin login; accessed only via service_role (Edge Functions).';

-- Multi-device bypass for designated superadmin email only (see validate_subscription_access below).

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
  v_designated_superadmin_email constant text := 'sithumpriyashan12@gmail.com';
  v_skip_device boolean;
BEGIN
  SELECT *
  INTO sub_record
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::timestamptz, false;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    INNER JOIN auth.users au ON au.id = pr.id
    WHERE pr.id = p_user_id
      AND pr.role = 'superadmin'::profile_role_v2
      AND lower(trim(au.email::text)) = lower(trim(v_designated_superadmin_email))
  )
  INTO v_skip_device;

  IF sub_record.device_id IS DISTINCT FROM p_device_id THEN
    IF NOT v_skip_device THEN
      RETURN QUERY SELECT false, 'device_mismatch'::text, sub_record.expiry_date, sub_record.is_active;
      RETURN;
    END IF;
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
