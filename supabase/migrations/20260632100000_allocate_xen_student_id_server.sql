-- Server-side XEN ID allocation for teacher registration (edge function / service role).

CREATE OR REPLACE FUNCTION public.allocate_xen_student_id(p_student_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
  v_role     public.profile_role_v2;
  v_year     int;
  v_num      bigint;
  v_id       text;
BEGIN
  SELECT p.xen_student_id, p.role
  INTO v_existing, v_role
  FROM public.profiles p
  WHERE p.id = p_student_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  IF v_role IS DISTINCT FROM 'parent_student'::public.profile_role_v2 THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  IF v_existing IS NOT NULL AND length(trim(v_existing)) > 0 THEN
    RETURN trim(v_existing);
  END IF;

  SELECT EXTRACT(YEAR FROM COALESCE(u.created_at, now()))::int
  INTO v_year
  FROM auth.users u
  WHERE u.id = p_student_user_id;

  IF v_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM now())::int;
  END IF;

  v_num := nextval('public.xen_student_number_seq');
  v_id := public.format_xen_student_id(v_year, v_num);

  UPDATE public.profiles
  SET
    xen_student_number = v_num,
    xen_student_id_year = v_year,
    xen_student_id = v_id
  WHERE id = p_student_user_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_xen_student_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_xen_student_id(uuid) TO service_role;
