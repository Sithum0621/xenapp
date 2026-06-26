-- Today's schedule: match the device calendar (local date + day-of-week), not only UTC on the server.

DROP FUNCTION IF EXISTS public.student_today_schedule(uuid);

CREATE OR REPLACE FUNCTION public.student_today_schedule(
  p_student_user_id uuid,
  p_local_date date DEFAULT NULL,
  p_local_dow int DEFAULT NULL
)
RETURNS TABLE (
  schedule_id        uuid,
  lecture_group_id   uuid,
  group_name         text,
  institute_name     text,
  start_time         text,
  end_time           text,
  kind               text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := COALESCE(p_local_date, CURRENT_DATE);
  v_dow   int  := COALESCE(p_local_dow, EXTRACT(DOW FROM v_today)::int);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_local_dow IS NOT NULL AND (p_local_dow < 0 OR p_local_dow > 6) THEN
    RAISE EXCEPTION 'invalid_local_dow';
  END IF;

  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    gs.id                                   AS schedule_id,
    g.id                                    AS lecture_group_id,
    g.name::text                            AS group_name,
    i.name::text                            AS institute_name,
    to_char(gs.start_time, 'HH24:MI')::text AS start_time,
    to_char(gs.end_time,   'HH24:MI')::text AS end_time,
    gs.kind::text                           AS kind
  FROM public.lecture_group_students lgs
  INNER JOIN public.lecture_groups   g  ON g.id  = lgs.lecture_group_id
  INNER JOIN public.institutes       i  ON i.id  = g.institute_id
  INNER JOIN public.group_schedules  gs ON gs.lecture_group_id = g.id
  WHERE lgs.student_user_id = p_student_user_id
    AND (
      (gs.kind = 'recurring_weekly'::public.group_schedule_kind AND gs.day_of_week = v_dow)
      OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
    )
  ORDER BY gs.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.student_today_schedule(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_today_schedule(uuid, date, int) TO authenticated;

-- Parent / guardian: list classes for a linked student (same shape as student_list_my_classes).
CREATE OR REPLACE FUNCTION public.student_list_classes_for_student(p_student_user_id uuid)
RETURNS TABLE (
  lecture_group_id uuid,
  group_name text,
  group_description text,
  institute_id uuid,
  institute_name text,
  schedules jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
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
  WHERE lgs.student_user_id = p_student_user_id
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
