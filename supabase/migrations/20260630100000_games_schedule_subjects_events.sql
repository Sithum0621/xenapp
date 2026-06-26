-- Superadmin games schedule: subjects catalog and scheduled events.

CREATE TABLE IF NOT EXISTS public.games_schedule_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_schedule_subjects_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS games_schedule_subjects_name_lower_idx
  ON public.games_schedule_subjects (lower(trim(name)));

COMMENT ON TABLE public.games_schedule_subjects IS
  'Subject categories for platform-wide games schedule events (superadmin-managed).';

CREATE TABLE IF NOT EXISTS public.games_schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.games_schedule_subjects (id) ON DELETE RESTRICT,
  title text NOT NULL,
  event_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_schedule_events_title_nonempty CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS games_schedule_events_event_at_idx
  ON public.games_schedule_events (event_at DESC);

COMMENT ON TABLE public.games_schedule_events IS
  'Scheduled game events shown to students; each event belongs to one games_schedule_subjects row.';

ALTER TABLE public.games_schedule_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games_schedule_events ENABLE ROW LEVEL SECURITY;

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
    WHERE lower(trim(name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'subject_name_exists';
  END IF;

  INSERT INTO public.games_schedule_subjects (name)
  VALUES (v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_list_games_schedule_events()
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
          'id', e.id,
          'subject_id', e.subject_id,
          'subject_name', s.name,
          'title', e.title,
          'event_at', e.event_at,
          'notes', e.notes,
          'created_at', e.created_at
        )
        ORDER BY e.event_at DESC
      )
      FROM public.games_schedule_events e
      INNER JOIN public.games_schedule_subjects s ON s.id = e.subject_id
    ),
    '[]'::jsonb
  );
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
  v_event_at timestamptz;
  v_notes text;
  v_row public.games_schedule_events%ROWTYPE;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_subject_id := (p_payload->>'subject_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_subject';
  END;

  IF NOT EXISTS (SELECT 1 FROM public.games_schedule_subjects WHERE id = v_subject_id) THEN
    RAISE EXCEPTION 'invalid_subject';
  END IF;

  v_title := trim(coalesce(p_payload->>'title', ''));
  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'event_title_required';
  END IF;

  BEGIN
    v_event_at := (p_payload->>'event_at')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_event_at';
  END;

  IF v_event_at IS NULL THEN
    RAISE EXCEPTION 'invalid_event_at';
  END IF;

  v_notes := nullif(trim(coalesce(p_payload->>'notes', '')), '');

  INSERT INTO public.games_schedule_events (subject_id, title, event_at, notes)
  VALUES (v_subject_id, v_title, v_event_at, v_notes)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'subject_id', v_row.subject_id,
    'title', v_row.title,
    'event_at', v_row.event_at,
    'notes', v_row.notes,
    'created_at', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_games_schedule_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_create_games_schedule_subject(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_list_games_schedule_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_create_games_schedule_event(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.superadmin_list_games_schedule_subjects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_create_games_schedule_subject(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_list_games_schedule_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_create_games_schedule_event(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
