-- Parent profile: rename linked students (and self) from the dashboard.

CREATE OR REPLACE FUNCTION public.parent_update_student_name(
  p_student_user_id uuid,
  p_full_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid := auth.uid();
  v_trimmed text := trim(COALESCE(p_full_name, ''));
  v_parts text[];
  v_first text;
  v_last text;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_student_user_id IS NULL THEN
    RAISE EXCEPTION 'student_required';
  END IF;

  IF length(v_trimmed) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF p_student_user_id = v_parent THEN
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.parent_student_links l
    WHERE l.parent_user_id = v_parent
      AND l.student_user_id = p_student_user_id
  ) THEN
    RAISE EXCEPTION 'not_linked';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_student_user_id
      AND p.role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  v_parts := regexp_split_to_array(v_trimmed, '\s+');
  v_first := v_parts[1];
  IF array_length(v_parts, 1) > 1 THEN
    v_last := array_to_string(v_parts[2:array_length(v_parts, 1)], ' ');
  ELSE
    v_last := '-';
  END IF;

  UPDATE public.profiles
  SET
    first_name = v_first,
    last_name = v_last,
    full_name = v_trimmed
  WHERE id = p_student_user_id;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('full_name', v_trimmed)
  WHERE id = p_student_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_update_student_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_update_student_name(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.parent_update_student_name(uuid, text) IS
  'Parent updates display name for self or a linked student on their dashboard.';

NOTIFY pgrst, 'reload schema';
