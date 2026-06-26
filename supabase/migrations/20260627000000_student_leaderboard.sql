-- App-wide student leaderboard for home dashboard (gaming / MCQ scores).

CREATE TABLE IF NOT EXISTS public.student_leaderboard_entries (
  student_user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  best_subject     text NOT NULL,
  total_score      int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sle_subject_nonempty CHECK (length(trim(best_subject)) > 0),
  CONSTRAINT sle_score_non_negative CHECK (total_score >= 0)
);

CREATE INDEX IF NOT EXISTS sle_total_score_idx
  ON public.student_leaderboard_entries (total_score DESC);

COMMENT ON TABLE public.student_leaderboard_entries IS
  'Aggregated gaming / quiz points per student for global leaderboard ranking.';

ALTER TABLE public.student_leaderboard_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY sle_select_authenticated
  ON public.student_leaderboard_entries
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.student_leaderboard_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.student_leaderboard_snapshot(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_rank       int;
  v_total      int;
  v_ahead_pct  int;
  v_subject    text;
  v_score      int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH pool AS (
    SELECT
      p.id AS student_user_id,
      COALESCE(e.total_score, 0)::int AS total_score,
      COALESCE(NULLIF(trim(e.best_subject), ''), 'General')::text AS best_subject
    FROM public.profiles p
    LEFT JOIN public.student_leaderboard_entries e ON e.student_user_id = p.id
    WHERE p.role = 'parent_student'::public.profile_role_v2
  ),
  ranked AS (
    SELECT
      student_user_id,
      total_score,
      best_subject,
      RANK() OVER (ORDER BY total_score DESC, student_user_id) AS rk,
      COUNT(*) OVER ()::int AS participant_count
    FROM pool
  )
  SELECT r.rk, r.participant_count, r.best_subject, r.total_score
  INTO v_rank, v_total, v_subject, v_score
  FROM ranked r
  WHERE r.student_user_id = p_student_user_id;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object(
      'in_top_100', false,
      'rank', null,
      'ahead_percent', 0,
      'best_subject', 'General',
      'total_score', 0,
      'participant_count', 0
    );
  END IF;

  IF v_rank <= 100 THEN
    v_ahead_pct := NULL;
  ELSE
    v_ahead_pct := CASE
      WHEN v_total <= 1 THEN 0
      ELSE GREATEST(
        0,
        LEAST(
          100,
          FLOOR(((v_total - v_rank)::numeric / v_total::numeric) * 100)::int
        )
      )
    END;
  END IF;

  RETURN jsonb_build_object(
    'in_top_100', (v_rank <= 100),
    'rank', CASE WHEN v_rank <= 100 THEN v_rank ELSE NULL END,
    'ahead_percent', v_ahead_pct,
    'best_subject', v_subject,
    'total_score', v_score,
    'participant_count', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_leaderboard_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_leaderboard_snapshot(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
