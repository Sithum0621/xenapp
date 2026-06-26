-- PostgREST may not expose zero-arg SET-returning RPCs reliably ("without parameters in the schema cache").
-- Replace with an explicit jsonb parameter (reserved for future filters).

DROP FUNCTION IF EXISTS public.superadmin_list_institutes();
DROP FUNCTION IF EXISTS public.superadmin_list_institutes(jsonb);

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

REVOKE ALL ON FUNCTION public.superadmin_list_institutes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institutes(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
