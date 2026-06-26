-- RPC for the parent / student "Classes" tab.
-- Returns the lecture groups the calling user is enrolled in, with institute name and a JSONB
-- array of every schedule row for the group so the client can compute the next class time
-- against the device's locale / timezone. SECURITY DEFINER so the call works without proliferating
-- per-table student SELECT policies on lecture_group_students / lecture_groups / institutes /
-- group_schedules; the function itself enforces the "only own enrolments" filter via auth.uid().

CREATE OR REPLACE FUNCTION public.student_list_my_classes()
RETURNS TABLE (
  lecture_group_id uuid,
  group_name text,
  group_description text,
  institute_id uuid,
  institute_name text,
  schedules jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    g.id AS lecture_group_id,
    g.name::text AS group_name,
    COALESCE(g.description, '')::text AS group_description,
    i.id AS institute_id,
    COALESCE(i.name, '')::text AS institute_name,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id',          gs.id,
                   'kind',        gs.kind::text,
                   'day_of_week', gs.day_of_week,
                   'class_date',  gs.class_date,
                   'start_time',  to_char(gs.start_time, 'HH24:MI'),
                   'end_time',    to_char(gs.end_time, 'HH24:MI')
                 )
                 ORDER BY
                   CASE WHEN gs.kind = 'one_time'::public.group_schedule_kind
                          AND gs.class_date >= CURRENT_DATE THEN 0 ELSE 1 END,
                   gs.class_date NULLS LAST,
                   gs.day_of_week NULLS LAST,
                   gs.start_time
               )
        FROM public.group_schedules gs
        WHERE gs.lecture_group_id = g.id
      ),
      '[]'::jsonb
    ) AS schedules
  FROM public.lecture_group_students lgs
  INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
  INNER JOIN public.institutes      i ON i.id = g.institute_id
  WHERE lgs.student_user_id = v_user
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_my_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_my_classes() TO authenticated;

COMMENT ON FUNCTION public.student_list_my_classes() IS
  'Returns the lecture groups the caller is enrolled in, with institute name and schedules JSONB.';

NOTIFY pgrst, 'reload schema';
