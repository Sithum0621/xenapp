-- Games schedule event Q&A content (superadmin-managed).

CREATE TABLE IF NOT EXISTS public.games_schedule_event_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.games_schedule_events (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_schedule_event_questions_question_nonempty CHECK (length(trim(question)) > 0),
  CONSTRAINT games_schedule_event_questions_answer_nonempty CHECK (length(trim(answer)) > 0)
);

CREATE INDEX IF NOT EXISTS games_schedule_event_questions_event_id_idx
  ON public.games_schedule_event_questions (event_id, sort_order, created_at);

COMMENT ON TABLE public.games_schedule_event_questions IS
  'Question and answer pairs for a games schedule event; ordered by sort_order.';

ALTER TABLE public.games_schedule_event_questions ENABLE ROW LEVEL SECURITY;

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
    'created_at', e.created_at
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
        'answer', q.answer,
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
  v_elem jsonb;
  v_question text;
  v_answer text;
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

  v_questions := coalesce(p_payload->'questions', '[]'::jsonb);

  IF jsonb_typeof(v_questions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_questions';
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_questions) AS t(value)
  LOOP
    v_question := trim(coalesce(v_elem->>'question', ''));
    v_answer := trim(coalesce(v_elem->>'answer', ''));

    IF (length(v_question) > 0 AND length(v_answer) = 0)
      OR (length(v_question) = 0 AND length(v_answer) > 0) THEN
      RAISE EXCEPTION 'incomplete_question';
    END IF;
  END LOOP;

  DELETE FROM public.games_schedule_event_questions WHERE event_id = v_event_id;

  INSERT INTO public.games_schedule_event_questions (event_id, sort_order, question, answer)
  SELECT
    v_event_id,
    (ordinality - 1)::int,
    trim(elem->>'question'),
    trim(elem->>'answer')
  FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS t(elem, ordinality)
  WHERE length(trim(coalesce(elem->>'question', ''))) > 0
    AND length(trim(coalesce(elem->>'answer', ''))) > 0;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'question', q.question,
        'answer', q.answer,
        'sort_order', q.sort_order
      )
      ORDER BY q.sort_order ASC, q.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_saved
  FROM public.games_schedule_event_questions q
  WHERE q.event_id = v_event_id;

  RETURN jsonb_build_object('questions', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_get_games_schedule_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_save_games_schedule_event_questions(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.superadmin_get_games_schedule_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_save_games_schedule_event_questions(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
