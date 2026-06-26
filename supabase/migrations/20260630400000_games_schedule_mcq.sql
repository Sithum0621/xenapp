-- Games schedule events: MCQ quiz configuration and per-question choices.

ALTER TABLE public.games_schedule_events
  ADD COLUMN IF NOT EXISTS quiz_question_count integer,
  ADD COLUMN IF NOT EXISTS quiz_choice_count integer,
  ADD COLUMN IF NOT EXISTS quiz_time_limit_minutes integer;

ALTER TABLE public.games_schedule_events
  ADD CONSTRAINT games_schedule_events_quiz_choice_count_range
  CHECK (quiz_choice_count IS NULL OR (quiz_choice_count >= 3 AND quiz_choice_count <= 5));

ALTER TABLE public.games_schedule_events
  ADD CONSTRAINT games_schedule_events_quiz_question_count_positive
  CHECK (quiz_question_count IS NULL OR quiz_question_count > 0);

ALTER TABLE public.games_schedule_events
  ADD CONSTRAINT games_schedule_events_quiz_time_limit_positive
  CHECK (quiz_time_limit_minutes IS NULL OR quiz_time_limit_minutes > 0);

COMMENT ON COLUMN public.games_schedule_events.quiz_question_count IS
  'Number of MCQ questions for this event.';
COMMENT ON COLUMN public.games_schedule_events.quiz_choice_count IS
  'Number of answer choices per question (3–5).';
COMMENT ON COLUMN public.games_schedule_events.quiz_time_limit_minutes IS
  'Total quiz time limit in minutes.';

ALTER TABLE public.games_schedule_event_questions
  ADD COLUMN IF NOT EXISTS choices jsonb,
  ADD COLUMN IF NOT EXISTS correct_choice_index integer;

UPDATE public.games_schedule_event_questions
SET
  choices = jsonb_build_array(trim(answer)),
  correct_choice_index = 0
WHERE choices IS NULL AND answer IS NOT NULL;

ALTER TABLE public.games_schedule_event_questions
  DROP COLUMN IF EXISTS answer;

ALTER TABLE public.games_schedule_event_questions
  ALTER COLUMN choices SET DEFAULT '[]'::jsonb;

UPDATE public.games_schedule_event_questions
SET choices = '[]'::jsonb
WHERE choices IS NULL;

ALTER TABLE public.games_schedule_event_questions
  ALTER COLUMN choices SET NOT NULL,
  ALTER COLUMN correct_choice_index SET NOT NULL,
  ALTER COLUMN correct_choice_index SET DEFAULT 0;

ALTER TABLE public.games_schedule_event_questions
  DROP CONSTRAINT IF EXISTS games_schedule_event_questions_answer_nonempty;

COMMENT ON COLUMN public.games_schedule_event_questions.choices IS
  'JSON array of choice strings (length matches event quiz_choice_count).';
COMMENT ON COLUMN public.games_schedule_event_questions.correct_choice_index IS
  'Zero-based index into choices for the correct answer.';

CREATE OR REPLACE FUNCTION public.superadmin_get_games_schedule_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event jsonb;
  v_questions jsonb;
BEGIN
  PERFORM public.superadmin_assert();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;

  SELECT jsonb_build_object(
    'id', e.id,
    'subject_id', e.subject_id,
    'subject_name', coalesce(s.name, ''),
    'title', e.title,
    'event_at', e.event_at,
    'week_starts_on', e.week_starts_on,
    'week_ends_on', (e.week_starts_on + 6)::date,
    'is_active', e.is_active,
    'notes', e.notes,
    'created_at', e.created_at,
    'quiz_question_count', e.quiz_question_count,
    'quiz_choice_count', e.quiz_choice_count,
    'quiz_time_limit_minutes', e.quiz_time_limit_minutes
  )
  INTO v_event
  FROM public.games_schedule_events e
  INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
  WHERE e.id = p_event_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question', q.question,
        'choices', q.choices,
        'correct_choice_index', q.correct_choice_index,
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

CREATE OR REPLACE FUNCTION public.superadmin_save_games_schedule_event_questions(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_questions jsonb;
  v_quiz jsonb;
  v_question_count int;
  v_choice_count int;
  v_time_limit int;
  v_elem jsonb;
  v_question text;
  v_choices jsonb;
  v_choice_len int;
  v_correct int;
  v_saved jsonb;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_event_id := (p_payload->>'event_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_event';
  END;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.games_schedule_events WHERE id = v_event_id) THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  v_quiz := coalesce(p_payload->'quiz', '{}'::jsonb);

  BEGIN
    v_question_count := (v_quiz->>'question_count')::int;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_quiz_config';
  END;

  BEGIN
    v_choice_count := (v_quiz->>'choice_count')::int;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_quiz_config';
  END;

  BEGIN
    v_time_limit := (v_quiz->>'time_limit_minutes')::int;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_quiz_config';
  END;

  IF v_question_count IS NULL OR v_question_count < 1 OR v_question_count > 200 THEN
    RAISE EXCEPTION 'invalid_question_count';
  END IF;

  IF v_choice_count IS NULL OR v_choice_count < 3 OR v_choice_count > 5 THEN
    RAISE EXCEPTION 'invalid_choice_count';
  END IF;

  IF v_time_limit IS NULL OR v_time_limit < 1 THEN
    RAISE EXCEPTION 'invalid_time_limit';
  END IF;

  v_questions := coalesce(p_payload->'questions', '[]'::jsonb);

  IF jsonb_typeof(v_questions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_questions';
  END IF;

  IF jsonb_array_length(v_questions) <> v_question_count THEN
    RAISE EXCEPTION 'question_count_mismatch';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_questions) AS t(value)
  LOOP
    v_question := trim(coalesce(v_elem->>'question', ''));
    v_choices := coalesce(v_elem->'choices', '[]'::jsonb);

    IF length(v_question) = 0 THEN
      RAISE EXCEPTION 'incomplete_question';
    END IF;

    IF jsonb_typeof(v_choices) <> 'array' THEN
      RAISE EXCEPTION 'invalid_choices';
    END IF;

    v_choice_len := jsonb_array_length(v_choices);

    IF v_choice_len <> v_choice_count THEN
      RAISE EXCEPTION 'invalid_choices';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_choices) AS c(txt)
      WHERE length(trim(coalesce(txt, ''))) = 0
    ) THEN
      RAISE EXCEPTION 'incomplete_question';
    END IF;

    BEGIN
      v_correct := (v_elem->>'correct_choice_index')::int;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_correct_choice';
    END;

    IF v_correct IS NULL OR v_correct < 0 OR v_correct >= v_choice_count THEN
      RAISE EXCEPTION 'invalid_correct_choice';
    END IF;
  END LOOP;

  UPDATE public.games_schedule_events
  SET
    quiz_question_count = v_question_count,
    quiz_choice_count = v_choice_count,
    quiz_time_limit_minutes = v_time_limit
  WHERE id = v_event_id;

  DELETE FROM public.games_schedule_event_questions WHERE event_id = v_event_id;

  INSERT INTO public.games_schedule_event_questions (
    event_id,
    sort_order,
    question,
    choices,
    correct_choice_index
  )
  SELECT
    v_event_id,
    (ordinality - 1)::int,
    trim(elem->>'question'),
    elem->'choices',
    (elem->>'correct_choice_index')::int
  FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS t(elem, ordinality);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question', q.question,
        'choices', q.choices,
        'correct_choice_index', q.correct_choice_index,
        'sort_order', q.sort_order
      )
      ORDER BY q.sort_order ASC, q.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_saved
  FROM public.games_schedule_event_questions q
  WHERE q.event_id = v_event_id;

  RETURN jsonb_build_object(
    'quiz', jsonb_build_object(
      'question_count', v_question_count,
      'choice_count', v_choice_count,
      'time_limit_minutes', v_time_limit
    ),
    'questions', v_saved
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
