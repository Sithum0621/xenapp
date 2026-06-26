-- Games schedule: one attempt per student per event, server-side deadline, scored results.

CREATE TABLE IF NOT EXISTS public.games_schedule_event_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_id          uuid NOT NULL REFERENCES public.games_schedule_events (id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  deadline_at       timestamptz NOT NULL,
  completed_at      timestamptz,
  score             integer NOT NULL DEFAULT 0,
  total_questions   integer NOT NULL,
  completion_reason text,
  CONSTRAINT gsea_student_event_unique UNIQUE (student_user_id, event_id),
  CONSTRAINT gsea_total_questions_positive CHECK (total_questions > 0),
  CONSTRAINT gsea_score_non_negative CHECK (score >= 0),
  CONSTRAINT gsea_completion_reason_valid CHECK (
    completion_reason IS NULL OR completion_reason IN ('time_up', 'all_answered')
  )
);

CREATE INDEX IF NOT EXISTS gsea_event_id_idx
  ON public.games_schedule_event_attempts (event_id);

CREATE INDEX IF NOT EXISTS gsea_student_user_id_idx
  ON public.games_schedule_event_attempts (student_user_id);

CREATE TABLE IF NOT EXISTS public.games_schedule_event_attempt_answers (
  attempt_id    uuid NOT NULL REFERENCES public.games_schedule_event_attempts (id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES public.games_schedule_event_questions (id) ON DELETE CASCADE,
  choice_index  integer NOT NULL,
  is_correct    boolean NOT NULL,
  answered_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT gseaa_choice_index_non_negative CHECK (choice_index >= 0)
);

ALTER TABLE public.games_schedule_event_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games_schedule_event_attempt_answers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.games_schedule_event_attempts IS
  'One scored attempt per student per games schedule event; deadline persists across sessions.';

CREATE OR REPLACE FUNCTION public.student_games_schedule_attempt_score(p_attempt_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*) FILTER (WHERE a.is_correct), 0)::integer
  FROM public.games_schedule_event_attempt_answers a
  WHERE a.attempt_id = p_attempt_id;
$$;

CREATE OR REPLACE FUNCTION public.student_finalize_games_schedule_attempt(
  p_attempt_id uuid,
  p_reason text
)
RETURNS public.games_schedule_event_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.games_schedule_event_attempts%ROWTYPE;
  v_score integer;
BEGIN
  SELECT * INTO v_row
  FROM public.games_schedule_event_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'attempt_not_found';
  END IF;

  IF v_row.completed_at IS NOT NULL THEN
    RETURN v_row;
  END IF;

  v_score := public.student_games_schedule_attempt_score(p_attempt_id);

  UPDATE public.games_schedule_event_attempts
  SET
    completed_at = now(),
    score = v_score,
    completion_reason = p_reason
  WHERE id = p_attempt_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_games_schedule_attempt_json(
  p_student_user_id uuid,
  p_event_id uuid,
  p_auto_finalize boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.games_schedule_event_attempts%ROWTYPE;
  v_answers jsonb;
  v_remaining integer;
BEGIN
  PERFORM public.student_assert_games_schedule_event_access(p_student_user_id, p_event_id);

  SELECT * INTO v_attempt
  FROM public.games_schedule_event_attempts
  WHERE student_user_id = p_student_user_id
    AND event_id = p_event_id;

  IF v_attempt.id IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  IF p_auto_finalize
    AND v_attempt.completed_at IS NULL
    AND v_attempt.deadline_at <= now()
  THEN
    SELECT * INTO v_attempt
    FROM public.student_finalize_games_schedule_attempt(v_attempt.id, 'time_up');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', aa.question_id,
        'choice_index', aa.choice_index,
        'is_correct', aa.is_correct
      )
      ORDER BY aa.answered_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_answers
  FROM public.games_schedule_event_attempt_answers aa
  WHERE aa.attempt_id = v_attempt.id;

  IF v_attempt.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'attempt_id', v_attempt.id,
      'deadline_at', v_attempt.deadline_at,
      'remaining_seconds', 0,
      'score', v_attempt.score,
      'total_questions', v_attempt.total_questions,
      'completed_at', v_attempt.completed_at,
      'completion_reason', v_attempt.completion_reason,
      'answers', v_answers
    );
  END IF;

  v_remaining := greatest(
    0,
    floor(extract(epoch FROM (v_attempt.deadline_at - now())))::integer
  );

  RETURN jsonb_build_object(
    'status', 'in_progress',
    'attempt_id', v_attempt.id,
    'deadline_at', v_attempt.deadline_at,
    'remaining_seconds', v_remaining,
    'score', public.student_games_schedule_attempt_score(v_attempt.id),
    'total_questions', v_attempt.total_questions,
    'completed_at', null,
    'completion_reason', null,
    'answers', v_answers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_start_games_schedule_attempt(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_time_limit integer;
  v_total integer;
  v_attempt public.games_schedule_event_attempts%ROWTYPE;
BEGIN
  PERFORM public.student_assert_games_schedule_event_access(p_student_user_id, p_event_id);

  SELECT e.quiz_time_limit_minutes, e.quiz_question_count
  INTO v_time_limit, v_total
  FROM public.games_schedule_events e
  WHERE e.id = p_event_id;

  IF v_time_limit IS NULL OR v_time_limit <= 0 THEN
    RAISE EXCEPTION 'quiz_not_configured';
  END IF;

  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'quiz_not_configured';
  END IF;

  SELECT * INTO v_attempt
  FROM public.games_schedule_event_attempts
  WHERE student_user_id = p_student_user_id
    AND event_id = p_event_id;

  IF v_attempt.id IS NOT NULL THEN
    RETURN public.student_games_schedule_attempt_json(p_student_user_id, p_event_id, true);
  END IF;

  INSERT INTO public.games_schedule_event_attempts (
    student_user_id,
    event_id,
    deadline_at,
    total_questions
  )
  VALUES (
    p_student_user_id,
    p_event_id,
    now() + make_interval(mins => v_time_limit),
    v_total
  )
  RETURNING * INTO v_attempt;

  RETURN public.student_games_schedule_attempt_json(p_student_user_id, p_event_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_sync_games_schedule_attempt(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.student_games_schedule_attempt_json(p_student_user_id, p_event_id, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.student_get_games_schedule_event(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event jsonb;
  v_questions jsonb;
  v_attempt jsonb;
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

  v_attempt := public.student_games_schedule_attempt_json(p_student_user_id, p_event_id, true);

  RETURN jsonb_build_object(
    'event', v_event,
    'questions', v_questions,
    'attempt', v_attempt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_check_games_schedule_choice(
  p_student_user_id uuid,
  p_question_id uuid,
  p_choice_index int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_choices jsonb;
  v_correct int;
  v_choice_text text;
  v_is_correct boolean;
  v_attempt public.games_schedule_event_attempts%ROWTYPE;
  v_existing public.games_schedule_event_attempt_answers%ROWTYPE;
  v_answered_count integer;
  v_attempt_state jsonb;
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

  SELECT * INTO v_attempt
  FROM public.games_schedule_event_attempts
  WHERE student_user_id = p_student_user_id
    AND event_id = v_event_id;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'attempt_not_started';
  END IF;

  IF v_attempt.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'attempt_completed';
  END IF;

  IF v_attempt.deadline_at <= now() THEN
    PERFORM public.student_finalize_games_schedule_attempt(v_attempt.id, 'time_up');
    RAISE EXCEPTION 'attempt_time_up';
  END IF;

  SELECT * INTO v_existing
  FROM public.games_schedule_event_attempt_answers
  WHERE attempt_id = v_attempt.id
    AND question_id = p_question_id;

  IF v_existing.question_id IS NOT NULL THEN
    IF v_correct IS NULL OR v_correct < 0 THEN
      RAISE EXCEPTION 'question_not_ready';
    END IF;
    v_choice_text := coalesce(v_choices->>v_correct, '');
    v_attempt_state := public.student_games_schedule_attempt_json(p_student_user_id, v_event_id, false);
    RETURN jsonb_build_object(
      'is_correct', v_existing.is_correct,
      'correct_choice_index', v_correct,
      'correct_choice_text', v_choice_text,
      'attempt', v_attempt_state
    );
  END IF;

  IF v_correct IS NULL OR v_correct < 0 THEN
    RAISE EXCEPTION 'question_not_ready';
  END IF;

  IF jsonb_typeof(v_choices) <> 'array' OR jsonb_array_length(v_choices) <= v_correct THEN
    RAISE EXCEPTION 'question_not_ready';
  END IF;

  IF p_choice_index >= jsonb_array_length(v_choices) THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  v_is_correct := p_choice_index = v_correct;
  v_choice_text := coalesce(v_choices->>v_correct, '');

  INSERT INTO public.games_schedule_event_attempt_answers (
    attempt_id,
    question_id,
    choice_index,
    is_correct
  )
  VALUES (
    v_attempt.id,
    p_question_id,
    p_choice_index,
    v_is_correct
  );

  SELECT count(*)::integer INTO v_answered_count
  FROM public.games_schedule_event_attempt_answers
  WHERE attempt_id = v_attempt.id;

  IF v_answered_count >= v_attempt.total_questions THEN
    PERFORM public.student_finalize_games_schedule_attempt(v_attempt.id, 'all_answered');
  END IF;

  v_attempt_state := public.student_games_schedule_attempt_json(p_student_user_id, v_event_id, false);

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'correct_choice_index', v_correct,
    'correct_choice_text', v_choice_text,
    'attempt', v_attempt_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_games_schedule_attempt_score(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_finalize_games_schedule_attempt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_games_schedule_attempt_json(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_start_games_schedule_attempt(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_sync_games_schedule_attempt(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.student_start_games_schedule_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_sync_games_schedule_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_get_games_schedule_event(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_check_games_schedule_choice(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
