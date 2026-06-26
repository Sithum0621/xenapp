-- Institute metadata + superadmin-only list/create RPCs.

ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contact_info text;

COMMENT ON COLUMN public.institutes.address IS 'Physical or mailing address.';
COMMENT ON COLUMN public.institutes.contact_info IS 'Contact details (phone, email, notes).';

CREATE OR REPLACE FUNCTION public.superadmin_list_institutes()
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
BEGIN
  PERFORM public.superadmin_assert();

  RETURN QUERY
  SELECT
    i.id,
    i.name::text AS name,
    i.address::text AS address,
    i.contact_info::text AS contact_info,
    i.created_at
  FROM public.institutes i
  ORDER BY i.created_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institutes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institutes() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_create_institute(
  p_name text,
  p_address text DEFAULT NULL,
  p_contact_info text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  PERFORM public.superadmin_assert();

  v_name := trim(coalesce(p_name, ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  INSERT INTO public.institutes (name, address, contact_info)
  VALUES (
    v_name,
    NULLIF(trim(coalesce(p_address, '')), ''),
    NULLIF(trim(coalesce(p_contact_info, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_create_institute(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_create_institute(text, text, text) TO authenticated;
