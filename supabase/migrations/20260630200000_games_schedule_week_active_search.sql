-- Games schedule events: one-week window from start date, active flag, searchable paginated list.

ALTER TABLE public.games_schedule_events
  ADD COLUMN IF NOT EXISTS week_starts_on date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.games_schedule_events
SET week_starts_on = coalesce(
  (event_at AT TIME ZONE 'UTC')::date,
  (created_at AT TIME ZONE 'UTC')::date
)
WHERE week_starts_on IS NULL;

ALTER TABLE public.games_schedule_events
  ALTER COLUMN week_starts_on SET NOT NULL;

CREATE INDEX IF NOT EXISTS games_schedule_events_week_starts_on_idx
  ON public.games_schedule_events (week_starts_on DESC);

CREATE INDEX IF NOT EXISTS games_schedule_events_created_at_idx
  ON public.games_schedule_events (created_at DESC);

COMMENT ON COLUMN public.games_schedule_events.week_starts_on IS
  'First day of the 7-day event window (inclusive through week_starts_on + 6 days).';

COMMENT ON COLUMN public.games_schedule_events.is_active IS
  'When false, the event is hidden from student-facing games schedule surfaces.';

DROP FUNCTION IF EXISTS public.superadmin_list_games_schedule_events();

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
  WHERE (
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
    WHERE (
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

CREATE OR REPLACE FUNCTION public.superadmin_set_games_schedule_event_active(p_payload jsonb)
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
  PERFORM public.superadmin_assert();

  BEGIN
    v_id := (p_payload->>'event_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_event';
  END;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_event';
  END IF;

  v_active := coalesce((p_payload->>'is_active')::boolean, false);

  UPDATE public.games_schedule_events
  SET is_active = v_active
  WHERE id = v_id
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
    'created_at', v_row.created_at
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

  IF NOT EXISTS (SELECT 1 FROM public.games_schedule_subjects WHERE id = v_subject_id) THEN
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
    BEGIN
      v_event_at := (p_payload->>'event_at')::timestamptz;
      IF v_event_at IS NOT NULL THEN
        v_starts_on := (v_event_at AT TIME ZONE 'UTC')::date;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

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
    is_active
  )
  VALUES (
    v_subject_id,
    v_title,
    v_event_at,
    v_starts_on,
    v_notes,
    true
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

REVOKE ALL ON FUNCTION public.superadmin_list_games_schedule_events(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_set_games_schedule_event_active(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_create_games_schedule_event(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.superadmin_list_games_schedule_events(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_set_games_schedule_event_active(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_create_games_schedule_event(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
