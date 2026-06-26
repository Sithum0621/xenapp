-- Student/parent games schedule: fetch event exam paper and check answers on selection.

CREATE OR REPLACE FUNCTION public.student_assert_games_schedule_event_access(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS void
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

  IF p_student_user_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games_schedule_events e
    WHERE e.id = p_event_id
      AND e.is_active = true
      AND (e.week_starts_on + 6) >= current_date
  ) THEN
    RAISE EXCEPTION 'event_not_available';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_get_games_schedule_event(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event jsonb;
  v_questions jsonb;
BEGIN
  PERFORM public.student_assert_games_schedule_event_access(p_student_user_id, p_event_id);

  SELECT jsonb_build_object(
    'id', e.id,
    'subject_name', coalesce(s.name, ''),
    'title', e.title,
    'week_starts_on', e.week_starts_on,
    'week_ends_on', (e.week_starts_on + 6)::date,
    'notes', e.notes,
    'quiz_question_count', e.quiz_question_count,
    'quiz_choice_count', e.quiz_choice_count,
    'quiz_time_limit_minutes', e.quiz_time_limit_minutes
  )
  INTO v_event
  FROM public.games_schedule_events e
  INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
  WHERE e.id = p_event_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question', q.question,
        'choices', q.choices,
        'sort_order', q.sort_order
      )
      ORDER BY q.sort_order ASC, q.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM public.games_schedule_event_questions q
  WHERE q.event_id = p_event_id;

  RETURN jsonb_build_object('event', v_event, 'questions', v_questions);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_check_games_schedule_choice(
  p_student_user_id uuid,
  p_question_id uuid,
  p_choice_index int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_choices jsonb;
  v_correct int;
  v_choice_text text;
BEGIN
  IF p_student_user_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  IF p_choice_index IS NULL OR p_choice_index < 0 THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  SELECT q.event_id, q.choices, q.correct_choice_index
  INTO v_event_id, v_choices, v_correct
  FROM public.games_schedule_event_questions q
  WHERE q.id = p_question_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  PERFORM public.student_assert_games_schedule_event_access(p_student_user_id, v_event_id);

  IF v_correct IS NULL OR v_correct < 0 THEN
    RAISE EXCEPTION 'question_not_ready';
  END IF;

  IF jsonb_typeof(v_choices) <> 'array' OR jsonb_array_length(v_choices) <= v_correct THEN
    RAISE EXCEPTION 'question_not_ready';
  END IF;

  IF p_choice_index >= jsonb_array_length(v_choices) THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  v_choice_text := coalesce(v_choices->>v_correct, '');

  RETURN jsonb_build_object(
    'is_correct', p_choice_index = v_correct,
    'correct_choice_index', v_correct,
    'correct_choice_text', v_choice_text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_assert_games_schedule_event_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_get_games_schedule_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_check_games_schedule_choice(uuid, uuid, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.student_get_games_schedule_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_check_games_schedule_choice(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
