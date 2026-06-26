-- Faster ILIKE search (pg_trgm) + pagination on superadmin list RPCs.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS profiles_full_name_trgm_idx
  ON public.profiles USING gin (full_name extensions.gin_trgm_ops);

-- Optional (requires elevated privileges): trigram index on auth.users(email) and btree on auth.users(created_at DESC).
-- Omit here so migrations succeed where auth schema DDL is restricted.

CREATE INDEX IF NOT EXISTS institutes_name_trgm_idx
  ON public.institutes USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS institutes_address_trgm_idx
  ON public.institutes USING gin (address extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS institutes_contact_trgm_idx
  ON public.institutes USING gin (contact_info extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS institutes_created_at_idx
  ON public.institutes (created_at DESC NULLS LAST);

-- Users list: jsonb query { search, role_filter, limit, offset }
DROP FUNCTION IF EXISTS public.superadmin_list_users(text);

CREATE OR REPLACE FUNCTION public.superadmin_list_users(p_query jsonb DEFAULT '{}'::jsonb)
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
DECLARE
  v_search text;
  v_role text;
  v_limit int := 40;
  v_offset int := 0;
BEGIN
  PERFORM public.superadmin_assert();

  v_search := trim(coalesce(p_query->>'search', ''));

  v_role := lower(trim(coalesce(p_query->>'role_filter', 'all')));
  IF v_role NOT IN ('all', 'teachers', 'admins', 'others') THEN
    v_role := 'all';
  END IF;

  BEGIN
    v_limit := least(greatest(coalesce((p_query->>'limit')::int, 40), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 40;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_query->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

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
    length(v_search) = 0
    OR u.email::text ILIKE '%' || v_search || '%'
    OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
  )
  AND (
    v_role = 'all'
    OR (
      v_role = 'teachers'
      AND lower(trim(COALESCE(p.role::text, ''))) = 'teacher'
    )
    OR (
      v_role = 'admins'
      AND lower(trim(COALESCE(p.role::text, ''))) IN ('admin', 'superadmin')
    )
    OR (
      v_role = 'others'
      AND lower(trim(COALESCE(p.role::text, ''))) NOT IN ('teacher', 'admin', 'superadmin')
    )
  )
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_users(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_users(jsonb) TO authenticated;

-- Institutes: add limit / offset inside p_filters (search unchanged)
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
  v_limit int := 40;
  v_offset int := 0;
BEGIN
  PERFORM public.superadmin_assert();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 40), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 40;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

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
  ORDER BY i.created_at DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institutes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institutes(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
