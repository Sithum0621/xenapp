-- Teacher-owned digital MCQ papers (reuses games_schedule_* tables).
-- Platform superadmin rows keep owner_teacher_user_id IS NULL.

ALTER TABLE public.games_schedule_subjects
  ADD COLUMN IF NOT EXISTS owner_teacher_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.games_schedule_events
  ADD COLUMN IF NOT EXISTS owner_teacher_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_group_source text,
  ADD COLUMN IF NOT EXISTS target_group_id uuid;

ALTER TABLE public.games_schedule_events
  DROP CONSTRAINT IF EXISTS games_schedule_events_target_group_source_check;

ALTER TABLE public.games_schedule_events
  ADD CONSTRAINT games_schedule_events_target_group_source_check
  CHECK (
    target_group_source IS NULL
    OR target_group_source IN ('institute', 'personal')
  );

DROP INDEX IF EXISTS public.games_schedule_subjects_name_lower_idx;

CREATE UNIQUE INDEX IF NOT EXISTS games_schedule_subjects_name_owner_lower_idx
  ON public.games_schedule_subjects (
    lower(trim(name)),
    coalesce(owner_teacher_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS games_schedule_events_teacher_idx
  ON public.games_schedule_events (owner_teacher_user_id, created_at DESC)
  WHERE owner_teacher_user_id IS NOT NULL;

COMMENT ON COLUMN public.games_schedule_subjects.owner_teacher_user_id IS
  'NULL = platform subject (superadmin). Set = private subject bucket for one teacher.';
COMMENT ON COLUMN public.games_schedule_events.owner_teacher_user_id IS
  'NULL = platform-wide event. Set = teacher digital paper for target_group_id.';
COMMENT ON COLUMN public.games_schedule_events.target_group_source IS
  'institute | personal — class that receives this paper when active.';
COMMENT ON COLUMN public.games_schedule_events.target_group_id IS
  'lecture_groups.id or teacher_personal_groups.id depending on target_group_source.';

CREATE OR REPLACE FUNCTION public.teacher_assert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_assert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_assert() TO authenticated;

CREATE OR REPLACE FUNCTION public.student_may_access_teacher_games_event(
  p_student_user_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_group uuid;
BEGIN
  SELECT e.target_group_source, e.target_group_id
  INTO v_source, v_group
  FROM public.games_schedule_events e
  WHERE e.id = p_event_id
    AND e.owner_teacher_user_id IS NOT NULL;

  IF v_group IS NULL OR v_source IS NULL THEN
    RETURN false;
  END IF;

  IF lower(trim(v_source)) = 'personal' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.teacher_personal_roster_entries r
      WHERE r.teacher_personal_group_id = v_group
        AND r.student_user_id = p_student_user_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.lecture_group_students lgs
    WHERE lgs.lecture_group_id = v_group
      AND lgs.student_user_id = p_student_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_may_access_teacher_games_event(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_may_access_teacher_games_event(uuid, uuid) TO authenticated;

-- Platform-only superadmin subject list/create
CREATE OR REPLACE FUNCTION public.superadmin_list_games_schedule_subjects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.superadmin_assert();

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'created_at', s.created_at
        )
        ORDER BY lower(trim(s.name))
      )
      FROM public.games_schedule_subjects s
      WHERE s.owner_teacher_user_id IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_create_games_schedule_subject(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_row public.games_schedule_subjects%ROWTYPE;
BEGIN
  PERFORM public.superadmin_assert();

  v_name := trim(coalesce(p_name, ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'subject_name_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.games_schedule_subjects
    WHERE owner_teacher_user_id IS NULL
      AND lower(trim(name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'subject_name_exists';
  END IF;

  INSERT INTO public.games_schedule_subjects (name, owner_teacher_user_id)
  VALUES (v_name, NULL)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
END;
$$;

-- Teacher CRUD
CREATE OR REPLACE FUNCTION public.teacher_list_games_schedule_subjects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.teacher_assert();

  RETURN coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'created_at', s.created_at
        )
        ORDER BY lower(trim(s.name))
      )
      FROM public.games_schedule_subjects s
      WHERE s.owner_teacher_user_id = auth.uid()
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_create_games_schedule_subject(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_row public.games_schedule_subjects%ROWTYPE;
BEGIN
  PERFORM public.teacher_assert();

  v_name := trim(coalesce(p_name, ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'subject_name_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.games_schedule_subjects
    WHERE owner_teacher_user_id = auth.uid()
      AND lower(trim(name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'subject_name_exists';
  END IF;

  INSERT INTO public.games_schedule_subjects (name, owner_teacher_user_id)
  VALUES (v_name, auth.uid())
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_list_games_schedule_events(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_limit int := 10;
  v_offset int := 0;
  v_total bigint;
  v_events jsonb;
BEGIN
  PERFORM public.teacher_assert();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 10), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 10;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  SELECT count(*)::bigint INTO v_total
  FROM public.games_schedule_events e
  INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
  WHERE e.owner_teacher_user_id = auth.uid()
    AND (
      length(v_search) = 0
      OR e.title ILIKE '%' || v_search || '%'
      OR s.name ILIKE '%' || v_search || '%'
      OR coalesce(e.notes, '') ILIKE '%' || v_search || '%'
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'subject_id', x.subject_id,
        'subject_name', x.subject_name,
        'title', x.title,
        'event_at', x.event_at,
        'week_starts_on', x.week_starts_on,
        'week_ends_on', x.week_ends_on,
        'is_active', x.is_active,
        'notes', x.notes,
        'created_at', x.created_at,
        'quiz_question_count', x.quiz_question_count,
        'quiz_choice_count', x.quiz_choice_count,
        'quiz_time_limit_minutes', x.quiz_time_limit_minutes,
        'target_group_source', x.target_group_source,
        'target_group_id', x.target_group_id
      )
      ORDER BY x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_events
  FROM (
    SELECT
      e.id,
      e.subject_id,
      s.name AS subject_name,
      e.title,
      e.event_at,
      e.week_starts_on,
      (e.week_starts_on + 6)::date AS week_ends_on,
      e.is_active,
      e.notes,
      e.created_at,
      e.quiz_question_count,
      e.quiz_choice_count,
      e.quiz_time_limit_minutes,
      e.target_group_source,
      e.target_group_id
    FROM public.games_schedule_events e
    INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
    WHERE e.owner_teacher_user_id = auth.uid()
      AND (
        length(v_search) = 0
        OR e.title ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
        OR coalesce(e.notes, '') ILIKE '%' || v_search || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object('total', v_total, 'events', v_events);
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_create_games_schedule_event(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_id uuid;
  v_title text;
  v_starts_on date;
  v_event_at timestamptz;
  v_notes text;
  v_source text;
  v_group_id uuid;
  v_row public.games_schedule_events%ROWTYPE;
  v_subject_name text;
BEGIN
  PERFORM public.teacher_assert();

  BEGIN
    v_subject_id := (p_payload->>'subject_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_subject';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games_schedule_subjects s
    WHERE s.id = v_subject_id
      AND s.owner_teacher_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;

  v_source := lower(trim(coalesce(p_payload->>'target_group_source', '')));
  BEGIN
    v_group_id := (p_payload->>'target_group_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_group';
  END;

  IF v_group_id IS NULL OR v_source NOT IN ('institute', 'personal') THEN
    RAISE EXCEPTION 'group_required';
  END IF;

  IF NOT public.chat_teacher_may_access_group(v_group_id, v_source) THEN
    RAISE EXCEPTION 'invalid_group';
  END IF;

  v_title := trim(coalesce(p_payload->>'title', ''));
  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'event_title_required';
  END IF;

  BEGIN
    v_starts_on := (p_payload->>'week_starts_on')::date;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_week_start';
  END;

  IF v_starts_on IS NULL THEN
    RAISE EXCEPTION 'invalid_week_start';
  END IF;

  v_event_at := (v_starts_on::text || 'T00:00:00Z')::timestamptz;
  v_notes := nullif(trim(coalesce(p_payload->>'notes', '')), '');

  INSERT INTO public.games_schedule_events (
    subject_id,
    title,
    event_at,
    week_starts_on,
    notes,
    is_active,
    owner_teacher_user_id,
    target_group_source,
    target_group_id
  )
  VALUES (
    v_subject_id,
    v_title,
    v_event_at,
    v_starts_on,
    v_notes,
    false,
    auth.uid(),
    v_source,
    v_group_id
  )
  RETURNING * INTO v_row;

  SELECT name INTO v_subject_name
  FROM public.games_schedule_subjects
  WHERE id = v_row.subject_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'subject_id', v_row.subject_id,
    'subject_name', coalesce(v_subject_name, ''),
    'title', v_row.title,
    'event_at', v_row.event_at,
    'week_starts_on', v_row.week_starts_on,
    'week_ends_on', (v_row.week_starts_on + 6)::date,
    'is_active', v_row.is_active,
    'notes', v_row.notes,
    'created_at', v_row.created_at,
    'quiz_question_count', v_row.quiz_question_count,
    'quiz_choice_count', v_row.quiz_choice_count,
    'quiz_time_limit_minutes', v_row.quiz_time_limit_minutes,
    'target_group_source', v_row.target_group_source,
    'target_group_id', v_row.target_group_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_set_games_schedule_event_active(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_active boolean;
  v_row public.games_schedule_events%ROWTYPE;
  v_subject_name text;
BEGIN
  PERFORM public.teacher_assert();

  BEGIN
    v_id := (p_payload->>'event_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_event';
  END;

  v_active := coalesce((p_payload->>'is_active')::boolean, false);

  UPDATE public.games_schedule_events
  SET is_active = v_active
  WHERE id = v_id
    AND owner_teacher_user_id = auth.uid()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  SELECT name INTO v_subject_name
  FROM public.games_schedule_subjects
  WHERE id = v_row.subject_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'subject_id', v_row.subject_id,
    'subject_name', coalesce(v_subject_name, ''),
    'title', v_row.title,
    'event_at', v_row.event_at,
    'week_starts_on', v_row.week_starts_on,
    'week_ends_on', (v_row.week_starts_on + 6)::date,
    'is_active', v_row.is_active,
    'notes', v_row.notes,
    'created_at', v_row.created_at,
    'quiz_question_count', v_row.quiz_question_count,
    'quiz_choice_count', v_row.quiz_choice_count,
    'quiz_time_limit_minutes', v_row.quiz_time_limit_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_get_games_schedule_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event jsonb;
  v_questions jsonb;
BEGIN
  PERFORM public.teacher_assert();

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
  WHERE e.id = p_event_id
    AND e.owner_teacher_user_id = auth.uid();

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

CREATE OR REPLACE FUNCTION public.teacher_save_games_schedule_event_questions(p_payload jsonb)
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
  PERFORM public.teacher_assert();

  BEGIN
    v_event_id := (p_payload->>'event_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_event';
  END;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games_schedule_events e
    WHERE e.id = v_event_id
      AND e.owner_teacher_user_id = auth.uid()
  ) THEN
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

-- Patch superadmin list/create events to platform-only
CREATE OR REPLACE FUNCTION public.superadmin_list_games_schedule_events(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_limit int := 10;
  v_offset int := 0;
  v_total bigint;
  v_events jsonb;
BEGIN
  PERFORM public.superadmin_assert();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 10), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 10;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  SELECT count(*)::bigint INTO v_total
  FROM public.games_schedule_events e
  INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
  WHERE e.owner_teacher_user_id IS NULL
    AND (
      length(v_search) = 0
      OR e.title ILIKE '%' || v_search || '%'
      OR s.name ILIKE '%' || v_search || '%'
      OR coalesce(e.notes, '') ILIKE '%' || v_search || '%'
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'subject_id', x.subject_id,
        'subject_name', x.subject_name,
        'title', x.title,
        'event_at', x.event_at,
        'week_starts_on', x.week_starts_on,
        'week_ends_on', x.week_ends_on,
        'is_active', x.is_active,
        'notes', x.notes,
        'created_at', x.created_at
      )
      ORDER BY x.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_events
  FROM (
    SELECT
      e.id,
      e.subject_id,
      s.name AS subject_name,
      e.title,
      e.event_at,
      e.week_starts_on,
      (e.week_starts_on + 6)::date AS week_ends_on,
      e.is_active,
      e.notes,
      e.created_at
    FROM public.games_schedule_events e
    INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
    WHERE e.owner_teacher_user_id IS NULL
      AND (
        length(v_search) = 0
        OR e.title ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
        OR coalesce(e.notes, '') ILIKE '%' || v_search || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object('total', v_total, 'events', v_events);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_create_games_schedule_event(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_id uuid;
  v_title text;
  v_starts_on date;
  v_event_at timestamptz;
  v_notes text;
  v_row public.games_schedule_events%ROWTYPE;
  v_subject_name text;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_subject_id := (p_payload->>'subject_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_subject';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.games_schedule_subjects
    WHERE id = v_subject_id
      AND owner_teacher_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;

  v_title := trim(coalesce(p_payload->>'title', ''));
  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'event_title_required';
  END IF;

  BEGIN
    v_starts_on := (p_payload->>'week_starts_on')::date;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_week_start';
  END;

  IF v_starts_on IS NULL THEN
    RAISE EXCEPTION 'invalid_week_start';
  END IF;

  v_event_at := (v_starts_on::text || 'T00:00:00Z')::timestamptz;
  v_notes := nullif(trim(coalesce(p_payload->>'notes', '')), '');

  INSERT INTO public.games_schedule_events (
    subject_id,
    title,
    event_at,
    week_starts_on,
    notes,
    is_active,
    owner_teacher_user_id
  )
  VALUES (
    v_subject_id,
    v_title,
    v_event_at,
    v_starts_on,
    v_notes,
    true,
    NULL
  )
  RETURNING * INTO v_row;

  SELECT name INTO v_subject_name
  FROM public.games_schedule_subjects
  WHERE id = v_row.subject_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'subject_id', v_row.subject_id,
    'subject_name', coalesce(v_subject_name, ''),
    'title', v_row.title,
    'event_at', v_row.event_at,
    'week_starts_on', v_row.week_starts_on,
    'week_ends_on', (v_row.week_starts_on + 6)::date,
    'is_active', v_row.is_active,
    'notes', v_row.notes,
    'created_at', v_row.created_at
  );
END;
$$;

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
  WHERE e.id = p_event_id
    AND e.owner_teacher_user_id IS NULL;

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

-- Students: platform events OR teacher papers for enrolled class
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
      AND (
        e.owner_teacher_user_id IS NULL
        OR public.student_may_access_teacher_games_event(p_student_user_id, e.id)
      )
  ) x;

  RETURN jsonb_build_object('events', v_events);
END;
$$;

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
      AND (
        e.owner_teacher_user_id IS NULL
        OR public.student_may_access_teacher_games_event(p_student_user_id, e.id)
      )
  ) THEN
    RAISE EXCEPTION 'event_not_available';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_list_games_schedule_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_create_games_schedule_subject(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_list_games_schedule_events(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_create_games_schedule_event(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_set_games_schedule_event_active(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_get_games_schedule_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teacher_save_games_schedule_event_questions(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.teacher_list_games_schedule_subjects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_create_games_schedule_subject(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_list_games_schedule_events(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_create_games_schedule_event(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_set_games_schedule_event_active(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_get_games_schedule_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_save_games_schedule_event_questions(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
