-- Reintroduce institute assignment on profiles (dropped earlier) for admin ↔ institute linking.
-- Superadmin-only RPCs to list, search, assign, and remove institute admins.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_institute_id_idx ON public.profiles (institute_id);

COMMENT ON COLUMN public.profiles.institute_id IS 'Institute assignment; used for admin role (and set only via superadmin RPCs for admins).';

CREATE OR REPLACE FUNCTION public.superadmin_list_institute_admins(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute uuid;
  v_limit int := 50;
  v_offset int := 0;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_institute := trim(coalesce(p_filters->>'institute_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'institute_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute) THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 50), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 50;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.institute_id = v_institute
    AND p.role = 'admin'::public.profile_role_v2
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institute_admins(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institute_admins(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_search_admins_for_institute(p_query jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  current_institute_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute uuid;
  v_search text;
  v_limit int := 25;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_institute := trim(coalesce(p_query->>'institute_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'institute_id_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute) THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;

  v_search := trim(coalesce(p_query->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_query->>'limit')::int, 25), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 25;
  END;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text,
    COALESCE(inst.name::text, '')
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.institutes inst ON inst.id = p.institute_id
  WHERE p.role = 'admin'::public.profile_role_v2
    AND p.institute_id IS DISTINCT FROM v_institute
    AND (
      length(v_search) = 0
      OR u.email::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_search_admins_for_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_search_admins_for_institute(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_assign_admin_to_institute(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute uuid;
  v_admin uuid;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_institute := trim(coalesce(p_payload->>'institute_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  BEGIN
    v_admin := trim(coalesce(p_payload->>'admin_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_admin_id';
  END;

  IF v_institute IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute) THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'cannot_assign_superadmin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'admin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.profiles
  SET institute_id = v_institute
  WHERE id = v_admin
    AND role = 'admin'::public.profile_role_v2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assign_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_assign_admin_to_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_assign_admin_to_institute(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_remove_admin_from_institute(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute uuid;
  v_admin uuid;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_institute := trim(coalesce(p_payload->>'institute_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  BEGIN
    v_admin := trim(coalesce(p_payload->>'admin_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_admin_id';
  END;

  IF v_institute IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  UPDATE public.profiles
  SET institute_id = NULL
  WHERE id = v_admin
    AND institute_id = v_institute
    AND role = 'admin'::public.profile_role_v2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_not_assigned_here';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_remove_admin_from_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_remove_admin_from_institute(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
