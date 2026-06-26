-- Institute list search (via p_filters.search) + update + delete RPCs.

CREATE OR REPLACE FUNCTION public.superadmin_list_institutes(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  contact_info text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
BEGIN
  PERFORM public.superadmin_assert();

  v_search := trim(coalesce(p_filters->>'search', ''));

  RETURN QUERY
  SELECT
    i.id,
    i.name::text AS name,
    i.address::text AS address,
    i.contact_info::text AS contact_info,
    i.created_at
  FROM public.institutes i
  WHERE (
    length(v_search) = 0
    OR i.name ILIKE '%' || v_search || '%'
    OR coalesce(i.address, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.contact_info, '') ILIKE '%' || v_search || '%'
  )
  ORDER BY i.created_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institutes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institutes(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_update_institute(
  p_id uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_contact_info text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  PERFORM public.superadmin_assert();

  v_name := trim(coalesce(p_name, ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  UPDATE public.institutes
  SET
    name = v_name,
    address = NULLIF(trim(coalesce(p_address, '')), ''),
    contact_info = NULLIF(trim(coalesce(p_contact_info, '')), '')
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_institute(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_update_institute(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_delete_institute(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  DELETE FROM public.institutes WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_delete_institute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_institute(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
