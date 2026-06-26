-- Teacher: broadcast a "Hello" push notification to all linked students in a class group (+ their parents).

CREATE OR REPLACE FUNCTION public.teacher_send_group_hello_push(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher      uuid := auth.uid();
  v_src          text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_group_name   text;
  v_student      uuid;
  v_parent       uuid;
  v_students     int := 0;
  v_notifications int := 0;
  v_title        text := 'Hello';
  v_body         text;
  v_parent_body  text;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_group_id IS NULL THEN RAISE EXCEPTION 'group_id_required'; END IF;

  IF v_src = 'personal' THEN
    IF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    SELECT pg.name INTO v_group_name
    FROM public.teacher_personal_groups pg
    WHERE pg.id = p_group_id;
  ELSE
    IF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
    SELECT lg.name INTO v_group_name
    FROM public.lecture_groups lg
    WHERE lg.id = p_group_id;
  END IF;

  IF v_group_name IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;

  v_body := format('Hello from %s!', v_group_name);
  v_parent_body := format('Hello! Your class %s says hi.', v_group_name);

  IF v_src = 'personal' THEN
    FOR v_student IN
      SELECT DISTINCT r.student_user_id
      FROM public.teacher_personal_roster_entries r
      WHERE r.teacher_personal_group_id = p_group_id
        AND r.student_user_id IS NOT NULL
    LOOP
      v_students := v_students + 1;

      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_student,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_hello',
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'route', '/parent-dashboard'
        )
      );
      v_notifications := v_notifications + 1;

      FOR v_parent IN
        SELECT psl.parent_user_id
        FROM public.parent_student_links psl
        WHERE psl.student_user_id = v_student
      LOOP
        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_parent,
          v_title,
          v_parent_body,
          jsonb_build_object(
            'type', 'group_hello',
            'student_user_id', v_student,
            'group_id', p_group_id,
            'group_source', v_src,
            'group_name', v_group_name,
            'route', '/parent-dashboard'
          )
        );
        v_notifications := v_notifications + 1;
      END LOOP;
    END LOOP;
  ELSE
    FOR v_student IN
      SELECT DISTINCT lgs.student_user_id
      FROM public.lecture_group_students lgs
      WHERE lgs.lecture_group_id = p_group_id
    LOOP
      v_students := v_students + 1;

      INSERT INTO public.notifications (user_id, title, body, data)
      VALUES (
        v_student,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'group_hello',
          'group_id', p_group_id,
          'group_source', v_src,
          'group_name', v_group_name,
          'route', '/parent-dashboard'
        )
      );
      v_notifications := v_notifications + 1;

      FOR v_parent IN
        SELECT psl.parent_user_id
        FROM public.parent_student_links psl
        WHERE psl.student_user_id = v_student
      LOOP
        INSERT INTO public.notifications (user_id, title, body, data)
        VALUES (
          v_parent,
          v_title,
          v_parent_body,
          jsonb_build_object(
            'type', 'group_hello',
            'student_user_id', v_student,
            'group_id', p_group_id,
            'group_source', v_src,
            'group_name', v_group_name,
            'route', '/parent-dashboard'
          )
        );
        v_notifications := v_notifications + 1;
      END LOOP;
    END LOOP;
  END IF;

  IF v_students = 0 THEN
    RAISE EXCEPTION 'no_students_in_group';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'group_name', v_group_name,
    'students_count', v_students,
    'notifications_sent', v_notifications
  );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_send_group_hello_push(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_send_group_hello_push(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
