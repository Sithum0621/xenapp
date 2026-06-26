-- Resolve XEN student ID (e.g. XEN-2026-0003) to the Supabase Auth email for sign-in.

CREATE OR REPLACE FUNCTION public.resolve_student_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key     text := lower(trim(COALESCE(p_identifier, '')));
  v_student uuid;
  v_email   text;
BEGIN
  IF length(v_key) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT p.id
  INTO v_student
  FROM public.profiles p
  WHERE lower(trim(COALESCE(p.xen_student_id, ''))) = v_key
    AND p.role = 'parent_student'::public.profile_role_v2
  LIMIT 1;

  IF v_student IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_student;

  RETURN NULLIF(trim(COALESCE(v_email, '')), '');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_student_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_student_login_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_student_login_email(text) TO authenticated;
