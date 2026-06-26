-- PostgREST RPC matching is unreliable for multi-arg functions with DEFAULT text params.
-- Single jsonb payload matches how list institutes uses p_filters.

DROP FUNCTION IF EXISTS public.superadmin_update_institute(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.superadmin_update_institute(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_id_raw text;
  v_name text;
BEGIN
  PERFORM public.superadmin_assert();

  v_id_raw := trim(coalesce(p_payload->>'id', ''));
  IF length(v_id_raw) = 0 THEN
    RAISE EXCEPTION 'id_required';
  END IF;

  BEGIN
    v_id := v_id_raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  UPDATE public.institutes
  SET
    name = v_name,
    address = NULLIF(trim(coalesce(p_payload->>'address', '')), ''),
    contact_info = NULLIF(trim(coalesce(p_payload->>'contact_info', '')), '')
  WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_update_institute(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
