-- Lock down designated superadmin account behavior:
-- 1) only this account can have role changes
-- 2) this account role must remain superadmin
-- 3) this account subscription stays active + never expires

CREATE OR REPLACE FUNCTION public.is_designated_superadmin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id
      AND lower(trim(u.email::text)) = lower(trim('sithumpriyashan12@gmail.com'))
      AND p.role = 'superadmin'::profile_role_v2
  );
$$;

REVOKE ALL ON FUNCTION public.is_designated_superadmin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_designated_superadmin_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_profile_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_designated_superadmin_user(OLD.id) THEN
      RAISE EXCEPTION 'role updates are restricted to designated superadmin account';
    END IF;

    IF NEW.role IS DISTINCT FROM 'superadmin'::profile_role_v2 THEN
      RAISE EXCEPTION 'designated superadmin role cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_update_guard ON public.profiles;
CREATE TRIGGER profiles_role_update_guard
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_role_updates();

-- Enforce designated account role + subscription baseline now.
UPDATE public.profiles p
SET role = 'superadmin'::profile_role_v2
WHERE p.id IN (
  SELECT u.id
  FROM auth.users u
  WHERE lower(trim(u.email::text)) = lower(trim('sithumpriyashan12@gmail.com'))
);

INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
SELECT
  u.id,
  COALESCE(p.device_id, 'superadmin-multi-device'),
  'infinity'::timestamptz,
  true,
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(trim(u.email::text)) = lower(trim('sithumpriyashan12@gmail.com'))
ON CONFLICT (user_id) DO UPDATE
SET
  expiry_date = 'infinity'::timestamptz,
  is_active = true,
  updated_at = now();

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

  IF sub_record.device_id IS DISTINCT FROM p_device_id THEN
    RETURN QUERY SELECT false, 'device_mismatch'::text, sub_record.expiry_date, sub_record.is_active;
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

  IF public.is_designated_superadmin_user(p_target_user_id) THEN
    INSERT INTO public.subscriptions (user_id, device_id, expiry_date, is_active, updated_at)
    VALUES (
      p_target_user_id,
      COALESCE(v_device, 'superadmin-multi-device'),
      'infinity'::timestamptz,
      true,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      expiry_date = 'infinity'::timestamptz,
      is_active = true,
      updated_at = now();
    RETURN;
  END IF;

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
