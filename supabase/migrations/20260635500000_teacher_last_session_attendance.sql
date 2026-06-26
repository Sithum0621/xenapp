-- Previous session attendance summary for teacher scan screen.

CREATE OR REPLACE FUNCTION public.teacher_get_last_session_attendance(
  p_group_id      uuid,
  p_schedule_id   uuid,
  p_group_source  text DEFAULT 'institute',
  p_before_date   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := auth.uid();
  v_src          text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_before       date := COALESCE(p_before_date, CURRENT_DATE);
  v_session_id   uuid;
  v_session_date date;
  v_total        int := 0;
  v_present      int := 0;
  v_absent_names jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_group_id IS NULL OR p_schedule_id IS NULL THEN RETURN NULL; END IF;

  IF v_src = 'personal' THEN
    IF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSE
    IF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  SELECT s.id, s.session_date
  INTO v_session_id, v_session_date
  FROM public.group_attendance_sessions s
  WHERE s.schedule_id = p_schedule_id
    AND s.session_date < v_before
    AND (
      (v_src = 'institute' AND s.lecture_group_id = p_group_id)
      OR (v_src = 'personal' AND s.teacher_personal_group_id = p_group_id)
    )
  ORDER BY s.session_date DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_src = 'personal' THEN
    SELECT COUNT(*)::int INTO v_total
    FROM public.teacher_personal_roster_entries r
    WHERE r.teacher_personal_group_id = p_group_id;

    SELECT COUNT(*)::int INTO v_present
    FROM public.group_attendance_marks m
    WHERE m.session_id = v_session_id AND m.present = true;

    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('name', sub.name) ORDER BY sub.name),
      '[]'::jsonb
    )
    INTO v_absent_names
    FROM (
      SELECT COALESCE(
        NULLIF(trim(r.display_name), ''),
        NULLIF(trim(p.full_name), ''),
        'Student'
      ) AS name
      FROM public.teacher_personal_roster_entries r
      LEFT JOIN public.profiles p ON p.id = r.student_user_id
      WHERE r.teacher_personal_group_id = p_group_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.group_attendance_marks m
          WHERE m.session_id = v_session_id
            AND m.present = true
            AND (
              m.personal_roster_id = r.id
              OR (r.student_user_id IS NOT NULL AND m.student_user_id = r.student_user_id)
            )
        )
    ) sub;
  ELSE
    SELECT COUNT(*)::int INTO v_total
    FROM public.lecture_group_students lgs
    WHERE lgs.lecture_group_id = p_group_id;

    SELECT COUNT(*)::int INTO v_present
    FROM public.group_attendance_marks m
    WHERE m.session_id = v_session_id AND m.present = true;

    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('name', sub.name) ORDER BY sub.name),
      '[]'::jsonb
    )
    INTO v_absent_names
    FROM (
      SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Student') AS name
      FROM public.lecture_group_students lgs
      INNER JOIN public.profiles p ON p.id = lgs.student_user_id
      WHERE lgs.lecture_group_id = p_group_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.group_attendance_marks m
          WHERE m.session_id = v_session_id
            AND m.present = true
            AND m.student_user_id = lgs.student_user_id
        )
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'session_date', v_session_date,
    'total_students', v_total,
    'present_count', v_present,
    'absent_count', GREATEST(v_total - v_present, 0),
    'absent_students', v_absent_names
  );
END;
$$;

COMMENT ON FUNCTION public.teacher_get_last_session_attendance(uuid, uuid, text, date) IS
  'Returns attendance summary for the most recent session before p_before_date for a group schedule slot.';

REVOKE ALL ON FUNCTION public.teacher_get_last_session_attendance(uuid, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_get_last_session_attendance(uuid, uuid, text, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
