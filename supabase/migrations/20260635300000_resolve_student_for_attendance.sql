-- Authoritative resolver: Wovello QR UUID or XEN student ID → profiles.id (parent_student).

CREATE OR REPLACE FUNCTION public.resolve_student_user_id_for_attendance(p_identifier text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw   text := trim(COALESCE(p_identifier, ''));
  v_key   text;
  v_match text;
  v_uuid  uuid;
  v_id    uuid;
BEGIN
  IF length(v_raw) = 0 THEN
    RAISE EXCEPTION 'identifier_required';
  END IF;

  -- Plain UUID from QR / USB scanner
  IF v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_uuid := lower(v_raw)::uuid;
  ELSE
    SELECT (regexp_match(
      v_raw,
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
      'i'
    ))[1]
    INTO v_match;

    IF v_match IS NOT NULL THEN
      v_uuid := lower(v_match)::uuid;
    END IF;
  END IF;

  IF v_uuid IS NOT NULL THEN
    SELECT p.id
    INTO v_id
    FROM public.profiles p
    WHERE p.id = v_uuid
      AND p.role = 'parent_student'::public.profile_role_v2
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    RAISE EXCEPTION 'student_not_found';
  END IF;

  -- XEN student ID fallback (e.g. XEN-2026-0003)
  v_key := lower(v_raw);
  IF v_key ~ '^xen-\d{4}-\d{4,}$' THEN
    SELECT p.id
    INTO v_id
    FROM public.profiles p
    WHERE lower(trim(COALESCE(p.xen_student_id, ''))) = v_key
      AND p.role = 'parent_student'::public.profile_role_v2
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    RAISE EXCEPTION 'student_not_found';
  END IF;

  RAISE EXCEPTION 'invalid_student_id';
END;
$$;

COMMENT ON FUNCTION public.resolve_student_user_id_for_attendance(text) IS
  'Maps a Wovello QR UUID or XEN student ID to profiles.id for attendance check-in.';

REVOKE ALL ON FUNCTION public.resolve_student_user_id_for_attendance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_student_user_id_for_attendance(text) TO authenticated;
