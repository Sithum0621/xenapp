-- Let any signed-in superadmin change any user's role (dev + admin tooling).
-- Still blocks normal users from changing their own role via direct profile updates.

CREATE OR REPLACE FUNCTION public.guard_profile_role_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'::profile_role_v2
    ) THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_designated_superadmin_user(OLD.id) THEN
      RAISE EXCEPTION 'role updates are restricted';
    END IF;

    IF NEW.role IS DISTINCT FROM 'superadmin'::profile_role_v2 THEN
      RAISE EXCEPTION 'designated superadmin role cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_profile_role(p_target_user_id uuid, p_role public.profile_role_v2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  PERFORM public.superadmin_assert();

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_profile_role(uuid, public.profile_role_v2) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_profile_role(uuid, public.profile_role_v2) TO authenticated;
