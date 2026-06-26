-- Parent / student class lists: institute lecture groups AND teacher personal groups.

DROP FUNCTION IF EXISTS public.student_list_classes_for_student(uuid);
DROP FUNCTION IF EXISTS public.student_list_my_classes();
DROP FUNCTION IF EXISTS public.student_today_schedule(uuid, date, int);

CREATE OR REPLACE FUNCTION public.student_list_classes_for_student(p_student_user_id uuid)
RETURNS TABLE (
  lecture_group_id uuid,
  group_source text,
  group_name text,
  group_description text,
  institute_id uuid,
  institute_name text,
  schedules jsonb,
  delivery jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    -- Institute lecture groups
    SELECT
      g.id AS lecture_group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(g.description, '')::text AS group_description,
      g.institute_id AS institute_id,
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
      ) AS schedules,
      jsonb_build_object(
        'mode', COALESCE(d.mode::text, 'physical'),
        'venue_label', COALESCE(NULLIF(trim(d.venue_label), ''), COALESCE(i.name, ''), ''),
        'physical_location_label', d.physical_location_label,
        'physical_location_url', d.physical_location_url,
        'online_join_url', d.online_join_url
      ) AS delivery
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.lecture_group_delivery d ON d.lecture_group_id = g.id
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    -- Teacher personal groups (linked roster rows only)
    SELECT
      pg.id AS lecture_group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      COALESCE(pg.description, '')::text AS group_description,
      NULL::uuid AS institute_id,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
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
          WHERE gs.teacher_personal_group_id = pg.id
        ),
        '[]'::jsonb
      ) AS schedules,
      jsonb_build_object(
        'mode', 'physical',
        'venue_label', COALESCE(
          NULLIF(trim(tp.full_name), ''),
          NULLIF(
            CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
            ''
          ),
          pg.name::text
        ),
        'physical_location_label', NULL,
        'physical_location_url', NULL,
        'online_join_url', NULL
      ) AS delivery
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    WHERE r.student_user_id = p_student_user_id
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_list_my_classes()
RETURNS TABLE (
  lecture_group_id uuid,
  group_source text,
  group_name text,
  group_description text,
  institute_id uuid,
  institute_name text,
  schedules jsonb,
  delivery jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      g.id AS lecture_group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(g.description, '')::text AS group_description,
      g.institute_id AS institute_id,
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
      ) AS schedules,
      jsonb_build_object(
        'mode', COALESCE(d.mode::text, 'physical'),
        'venue_label', COALESCE(NULLIF(trim(d.venue_label), ''), COALESCE(i.name, ''), ''),
        'physical_location_label', d.physical_location_label,
        'physical_location_url', d.physical_location_url,
        'online_join_url', d.online_join_url
      ) AS delivery
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.lecture_group_delivery d ON d.lecture_group_id = g.id
    WHERE lgs.student_user_id = v_user

    UNION ALL

    SELECT
      pg.id AS lecture_group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      COALESCE(pg.description, '')::text AS group_description,
      NULL::uuid AS institute_id,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
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
          WHERE gs.teacher_personal_group_id = pg.id
        ),
        '[]'::jsonb
      ) AS schedules,
      jsonb_build_object(
        'mode', 'physical',
        'venue_label', COALESCE(
          NULLIF(trim(tp.full_name), ''),
          NULLIF(
            CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
            ''
          ),
          pg.name::text
        ),
        'physical_location_label', NULL,
        'physical_location_url', NULL,
        'online_join_url', NULL
      ) AS delivery
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    WHERE r.student_user_id = v_user
  ) combined
  ORDER BY lower(combined.group_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_today_schedule(
  p_student_user_id uuid,
  p_local_date date DEFAULT NULL,
  p_local_dow int DEFAULT NULL
)
RETURNS TABLE (
  schedule_id              uuid,
  lecture_group_id         uuid,
  group_source             text,
  group_name               text,
  institute_name           text,
  start_time               text,
  end_time                 text,
  kind                     text,
  delivery_mode            text,
  venue_label              text,
  physical_location_label  text,
  physical_location_url    text,
  online_join_url          text
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

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      gs.id AS schedule_id,
      g.id AS lecture_group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(i.name, '')::text AS institute_name,
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      gs.kind::text AS kind,
      COALESCE(d.mode::text, 'physical') AS delivery_mode,
      COALESCE(NULLIF(trim(d.venue_label), ''), COALESCE(i.name, '')) AS venue_label,
      d.physical_location_label::text,
      d.physical_location_url::text,
      d.online_join_url::text
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    INNER JOIN public.group_schedules gs ON gs.lecture_group_id = g.id
    LEFT JOIN public.lecture_group_delivery d ON d.lecture_group_id = g.id
    WHERE lgs.student_user_id = p_student_user_id
      AND (
        (gs.kind = 'recurring_weekly'::public.group_schedule_kind AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )

    UNION ALL

    SELECT
      gs.id AS schedule_id,
      pg.id AS lecture_group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name,
      to_char(gs.start_time, 'HH24:MI')::text AS start_time,
      to_char(gs.end_time, 'HH24:MI')::text AS end_time,
      gs.kind::text AS kind,
      'physical'::text AS delivery_mode,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        pg.name::text
      ) AS venue_label,
      NULL::text AS physical_location_label,
      NULL::text AS physical_location_url,
      NULL::text AS online_join_url
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    INNER JOIN public.group_schedules gs ON gs.teacher_personal_group_id = pg.id
    WHERE r.student_user_id = p_student_user_id
      AND (
        (gs.kind = 'recurring_weekly'::public.group_schedule_kind AND gs.day_of_week = v_dow)
        OR (gs.kind = 'one_time'::public.group_schedule_kind AND gs.class_date = v_today)
      )
  ) combined
  ORDER BY combined.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.student_list_my_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_my_classes() TO authenticated;

REVOKE ALL ON FUNCTION public.student_today_schedule(uuid, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_today_schedule(uuid, date, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
