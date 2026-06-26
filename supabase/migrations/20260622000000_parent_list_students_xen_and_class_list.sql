-- Parent switcher: expose XEN id; ensure class lists never drop rows on missing institute join.

DROP FUNCTION IF EXISTS public.parent_list_students();

CREATE OR REPLACE FUNCTION public.parent_list_students()
RETURNS TABLE (
  student_user_id uuid,
  is_self         boolean,
  full_name       text,
  first_name      text,
  last_name       text,
  mobile_number   text,
  email           text,
  linked_at       timestamptz,
  xen_student_id  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  RETURN QUERY
  WITH self_row AS (
    SELECT
      p.id                                          AS student_user_id,
      TRUE                                          AS is_self,
      COALESCE(
        NULLIF(trim(p.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
          ''
        )
      )::text                                       AS full_name,
      p.first_name::text                            AS first_name,
      p.last_name::text                             AS last_name,
      pc.mobile_number::text                        AS mobile_number,
      u.email::text                                 AS email,
      NULL::timestamptz                             AS linked_at,
      NULLIF(trim(p.xen_student_id), '')::text       AS xen_student_id
    FROM public.profiles p
    LEFT JOIN public.profiles_contact pc ON pc.id = p.id
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_user
      AND p.role = 'parent_student'::public.profile_role_v2
  ),
  linked_rows AS (
    SELECT
      p.id                                          AS student_user_id,
      FALSE                                         AS is_self,
      COALESCE(
        NULLIF(trim(p.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
          ''
        )
      )::text                                       AS full_name,
      p.first_name::text                            AS first_name,
      p.last_name::text                             AS last_name,
      pc.mobile_number::text                        AS mobile_number,
      u.email::text                                 AS email,
      l.created_at                                  AS linked_at,
      NULLIF(trim(p.xen_student_id), '')::text       AS xen_student_id
    FROM public.parent_student_links l
    INNER JOIN public.profiles         p  ON p.id = l.student_user_id
    LEFT JOIN public.profiles_contact  pc ON pc.id = p.id
    LEFT JOIN auth.users               u  ON u.id = p.id
    WHERE l.parent_user_id = v_user
  )
  SELECT * FROM self_row
  UNION ALL
  SELECT * FROM linked_rows
  ORDER BY is_self DESC, linked_at NULLS FIRST
  LIMIT 3;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_list_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_list_students() TO authenticated;

-- Align student_list_my_classes with LEFT JOIN (same as student_list_classes_for_student).
DROP FUNCTION IF EXISTS public.student_list_my_classes();

CREATE OR REPLACE FUNCTION public.student_list_my_classes()
RETURNS TABLE (
  lecture_group_id uuid,
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
  SELECT
    g.id AS lecture_group_id,
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
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_my_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_my_classes() TO authenticated;

NOTIFY pgrst, 'reload schema';
