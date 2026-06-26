-- Superadmin-only RPCs to manage subscriptions across all users (bypasses RLS safely).

CREATE OR REPLACE FUNCTION public.superadmin_assert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'::profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_assert() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.superadmin_list_users(p_search text DEFAULT '')
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text,
  expiry_date timestamptz,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  RETURN QUERY
  SELECT
    u.id,
    u.email::text AS email,
    COALESCE(p.full_name, '')::text AS full_name,
    COALESCE(p.role::text, '') AS role,
    s.expiry_date,
    COALESCE(s.is_active, false) AS is_active
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.subscriptions s ON s.user_id = u.id
  WHERE (
    trim(coalesce(p_search, '')) = ''
    OR u.email::text ILIKE '%' || trim(p_search) || '%'
    OR COALESCE(p.full_name, '') ILIKE '%' || trim(p_search) || '%'
  )
  ORDER BY u.created_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_users(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_extend_subscription(p_target_user_id uuid, p_days int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device text;
  v_new_expiry timestamptz;
BEGIN
  PERFORM public.superadmin_assert();

  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'invalid days';
  END IF;

  SELECT COALESCE(device_id, 'superadmin-managed') INTO v_device
  FROM public.profiles
  WHERE id = p_target_user_id;

  v_new_expiry :=
    GREATEST(COALESCE((SELECT expiry_date FROM public.subscriptions WHERE user_id = p_target_user_id), now()), now())
    + make_interval(days => p_days);

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
  VALUES (
    p_target_user_id,
    COALESCE(v_device, 'superadmin-managed'),
    v_new_expiry,
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    expiry_date = EXCLUDED.expiry_date,
    is_active = true,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_extend_subscription(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_extend_subscription(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_set_subscription_active(p_target_user_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device text;
BEGIN
  PERFORM public.superadmin_assert();

  SELECT COALESCE(device_id, 'superadmin-managed') INTO v_device
  FROM public.profiles
  WHERE id = p_target_user_id;

  INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
  VALUES (
    p_target_user_id,
    COALESCE(v_device, 'superadmin-managed'),
    now(),
    COALESCE(p_is_active, false),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_active = COALESCE(p_is_active, false),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_subscription_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_subscription_active(uuid, boolean) TO authenticated;
