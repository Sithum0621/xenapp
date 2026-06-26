-- Fix active exam detection for students using the dashboard as themselves (not only via parent links).

CREATE OR REPLACE FUNCTION public.parent_list_active_games_schedule_exams()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exams jsonb;
  v_attempt_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  FOR v_attempt_id IN
    SELECT a.id
    FROM public.games_schedule_event_attempts a
    WHERE a.completed_at IS NULL
      AND a.deadline_at <= now()
      AND (
        a.student_user_id = v_user
        OR EXISTS (
          SELECT 1
          FROM public.parent_student_links l
          WHERE l.parent_user_id = v_user
            AND l.student_user_id = a.student_user_id
        )
      )
  LOOP
    PERFORM public.student_finalize_games_schedule_attempt(v_attempt_id, 'time_up');
  END LOOP;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_user_id', x.student_user_id,
        'event_id', x.event_id,
        'event_title', x.event_title,
        'deadline_at', x.deadline_at,
        'remaining_seconds', x.remaining_seconds
      )
      ORDER BY x.deadline_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_exams
  FROM (
    SELECT
      a.student_user_id,
      a.event_id,
      e.title AS event_title,
      a.deadline_at,
      greatest(
        0,
        floor(extract(epoch FROM (a.deadline_at - now())))::integer
      ) AS remaining_seconds
    FROM public.games_schedule_event_attempts a
    INNER JOIN public.games_schedule_events e ON e.id = a.event_id
    WHERE a.completed_at IS NULL
      AND a.deadline_at > now()
      AND e.is_active = true
      AND (e.week_starts_on + 6) >= current_date
      AND (
        a.student_user_id = v_user
        OR EXISTS (
          SELECT 1
          FROM public.parent_student_links l
          WHERE l.parent_user_id = v_user
            AND l.student_user_id = a.student_user_id
        )
      )
  ) x;

  RETURN jsonb_build_object('exams', v_exams);
END;
$$;

NOTIFY pgrst, 'reload schema';
