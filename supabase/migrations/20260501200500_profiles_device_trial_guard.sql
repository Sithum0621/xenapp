ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS profiles_device_id_idx ON public.profiles (device_id);

CREATE OR REPLACE FUNCTION public.has_used_device_trial(p_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE device_id = p_device_id
      AND subscription_status IN ('trial', 'active', 'past_due', 'cancelled')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_used_device_trial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_used_device_trial(text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_used_device_trial(text) TO authenticated;
