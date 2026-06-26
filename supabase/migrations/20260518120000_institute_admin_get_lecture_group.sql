-- Single lecture group by id for admin manage view (no list scan / pagination).

CREATE OR REPLACE FUNCTION public.institute_admin_get_lecture_group(p_lecture_group_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  primary_teacher_user_id uuid,
  primary_teacher_full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  RETURN QUERY
  SELECT
    g.id,
    g.name::text,
    g.description::text,
    g.created_at,
    g.primary_teacher_user_id,
    COALESCE(pt.full_name, '')::text
  FROM public.lecture_groups g
  INNER JOIN public.profiles pt ON pt.id = g.primary_teacher_user_id
  WHERE g.id = p_lecture_group_id
    AND g.institute_id = v_inst;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_get_lecture_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_get_lecture_group(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
