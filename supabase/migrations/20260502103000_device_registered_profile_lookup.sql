-- Anonymous cold-start check: does this device already have a Wovello profile? (RLS blocks direct SELECT.)

CREATE OR REPLACE FUNCTION public.device_has_registered_profile(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.device_id IS NOT NULL
      AND length(trim(p.device_id)) > 0
      AND trim(p.device_id) = trim(coalesce(p_device_id, ''))
  );
$$;

REVOKE ALL ON FUNCTION public.device_has_registered_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.device_has_registered_profile(text) TO anon;
GRANT EXECUTE ON FUNCTION public.device_has_registered_profile(text) TO authenticated;
