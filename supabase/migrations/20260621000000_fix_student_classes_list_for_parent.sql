-- Fix parent class list: reliable auth, include all enrollments, link by XEN ID.

-- parent_link_student: also match xen_student_id (e.g. XEN-2026-0003)
CREATE OR REPLACE FUNCTION public.parent_link_student(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent      uuid := auth.uid();
  v_identifier  text := trim(COALESCE(p_identifier, ''));
  v_identifier_lower text := lower(trim(COALESCE(p_identifier, '')));
  v_student     uuid;
  v_norm_phone  text;
  v_linked_cnt  int;
  v_self_count  int;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(v_identifier) = 0 THEN RAISE EXCEPTION 'identifier_required'; END IF;

  SELECT COUNT(*)::int INTO v_linked_cnt FROM public.parent_student_links WHERE parent_user_id = v_parent;
  SELECT COUNT(*)::int INTO v_self_count FROM public.profiles
    WHERE id = v_parent AND role = 'parent_student'::public.profile_role_v2;
  IF (v_linked_cnt + v_self_count) >= 3 THEN
    RAISE EXCEPTION 'student_limit_reached';
  END IF;

  -- 0) XEN student ID on profile
  SELECT p.id INTO v_student
  FROM public.profiles p
  WHERE lower(trim(COALESCE(p.xen_student_id, ''))) = v_identifier_lower
  LIMIT 1;

  -- 1) Email match
  IF v_student IS NULL THEN
    SELECT u.id INTO v_student
    FROM auth.users u
    WHERE lower(COALESCE(u.email, '')) = v_identifier_lower
    LIMIT 1;
  END IF;

  -- 2) Mobile match (last 9 digits)
  IF v_student IS NULL THEN
    v_norm_phone := regexp_replace(v_identifier, '\D', '', 'g');
    IF length(v_norm_phone) >= 9 THEN
      SELECT pc.id INTO v_student
      FROM public.profiles_contact pc
      WHERE pc.mobile_number IS NOT NULL
        AND right(regexp_replace(pc.mobile_number, '\D', '', 'g'), 9)
            = right(v_norm_phone, 9)
      LIMIT 1;
    END IF;
  END IF;

  -- 3) NIC match
  IF v_student IS NULL THEN
    SELECT pc.id INTO v_student
    FROM public.profiles_contact pc
    WHERE lower(COALESCE(pc.nic_number, '')) = v_identifier_lower
    LIMIT 1;
  END IF;

  IF v_student IS NULL THEN RAISE EXCEPTION 'student_not_found'; END IF;
  IF v_student = v_parent THEN RAISE EXCEPTION 'cannot_link_self'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_student
      AND role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  INSERT INTO public.parent_student_links (parent_user_id, student_user_id)
  VALUES (v_parent, v_student)
  ON CONFLICT (parent_user_id, student_user_id) DO NOTHING;

  RETURN jsonb_build_object('student_user_id', v_student);
END;
$$;

DROP FUNCTION IF EXISTS public.student_list_classes_for_student(uuid);

CREATE OR REPLACE FUNCTION public.student_list_classes_for_student(p_student_user_id uuid)
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

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
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
  WHERE lgs.student_user_id = p_student_user_id
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_classes_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_classes_for_student(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
