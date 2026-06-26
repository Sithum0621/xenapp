-- Fetch a single institute for superadmin manage / profiles screens (bypasses RLS).

CREATE OR REPLACE FUNCTION public.superadmin_get_institute(p_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  contact_info text,
  address_line1 text,
  address_line2 text,
  email text,
  contact_number text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id_required';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.name::text AS name,
    i.address::text AS address,
    i.contact_info::text AS contact_info,
    i.address_line1::text AS address_line1,
    i.address_line2::text AS address_line2,
    i.email::text AS email,
    i.contact_number::text AS contact_number,
    i.notes::text AS notes,
    i.created_at
  FROM public.institutes i
  WHERE i.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_get_institute(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_institute(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
