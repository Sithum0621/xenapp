-- Parent/student-facing games schedule: list active events within their week window.

CREATE OR REPLACE FUNCTION public.student_list_games_schedule_events(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_events jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_student_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_student';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'subject_name', x.subject_name,
        'title', x.title,
        'week_starts_on', x.week_starts_on,
        'week_ends_on', x.week_ends_on,
        'notes', x.notes,
        'quiz_question_count', x.quiz_question_count,
        'quiz_choice_count', x.quiz_choice_count,
        'quiz_time_limit_minutes', x.quiz_time_limit_minutes
      )
      ORDER BY x.week_starts_on ASC, x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_events
  FROM (
    SELECT
      e.id,
      s.name AS subject_name,
      e.title,
      e.week_starts_on,
      (e.week_starts_on + 6)::date AS week_ends_on,
      e.notes,
      e.quiz_question_count,
      e.quiz_choice_count,
      e.quiz_time_limit_minutes,
      e.created_at
    FROM public.games_schedule_events e
    INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
    WHERE e.is_active = true
      AND (e.week_starts_on + 6) >= current_date
  ) x;

  RETURN jsonb_build_object('events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.student_list_games_schedule_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_list_games_schedule_events(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
