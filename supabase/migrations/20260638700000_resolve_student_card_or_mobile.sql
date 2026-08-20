-- Attendance / payment lookup: issued class-card token or Sri Lanka mobile
-- (XEN student IDs still resolve for older accounts).

CREATE OR REPLACE FUNCTION public.resolve_student_user_id_for_attendance(p_identifier text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw     text := trim(COALESCE(p_identifier, ''));
  v_key     text;
  v_match   text;
  v_uuid    uuid;
  v_id      uuid;
  v_digits  text;
  v_local   text;
BEGIN
  IF length(v_raw) = 0 THEN
    RAISE EXCEPTION 'identifier_required';
  END IF;

  -- Teacher-issued class card (mtc1_…), including welcome?card= URLs
  v_match := (regexp_match(v_raw, 'mtc1_[A-Za-z0-9]{20}'))[1];
  IF v_match IS NOT NULL THEN
    SELECT c.student_user_id
    INTO v_id
    FROM public.issued_class_cards c
    INNER JOIN public.profiles p ON p.id = c.student_user_id
    WHERE c.token = v_match
      AND p.role = 'parent_student'::public.profile_role_v2
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.issued_class_cards c WHERE c.token = v_match) THEN
      RAISE EXCEPTION 'card_unclaimed';
    END IF;

    RAISE EXCEPTION 'student_not_found';
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

  -- Sri Lanka mobile (077… / +94…)
  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  IF v_digits LIKE '0094%' THEN
    v_local := substr(v_digits, 5);
  ELSIF v_digits LIKE '94%' THEN
    v_local := substr(v_digits, 3);
  ELSIF v_digits LIKE '0%' THEN
    v_local := substr(v_digits, 2);
  ELSE
    v_local := v_digits;
  END IF;

  IF length(v_local) = 9 AND v_local LIKE '7%' THEN
    SELECT pc.id
    INTO v_id
    FROM public.profiles_contact pc
    INNER JOIN public.profiles p ON p.id = pc.id
    WHERE p.role = 'parent_student'::public.profile_role_v2
      AND right(regexp_replace(coalesce(pc.mobile_number, ''), '\D', '', 'g'), 9) = v_local
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;

    RAISE EXCEPTION 'student_not_found';
  END IF;

  -- Legacy XEN student ID (e.g. XEN-2026-0003)
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
  'Maps an issued class-card token, Sri Lanka mobile, QR UUID, or legacy XEN ID to profiles.id.';

REVOKE ALL ON FUNCTION public.resolve_student_user_id_for_attendance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_student_user_id_for_attendance(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
