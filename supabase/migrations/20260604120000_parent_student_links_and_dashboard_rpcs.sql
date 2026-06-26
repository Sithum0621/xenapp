-- Parent ↔ student linking + dashboard RPCs powering the multi-student Parent dashboard.
--
-- New table:
--   public.parent_student_links — many-to-many between a parent_user (a profile with role
--   parent_student) and the student profiles they want to track. Hard cap of 3 visible
--   students enforced in parent_link_student().
--
-- New RPCs (all SECURITY DEFINER, EXECUTE granted to authenticated only):
--   parent_list_students()                          → switcher data (self + linked, max 3)
--   parent_link_student(p_identifier text)          → link by email / mobile / NIC
--   parent_unlink_student(p_student_user_id uuid)   → remove a link
--   student_today_schedule(p_student_user_id uuid)  → today's classes for selected student
--   student_attendance_summary(p_student_user_id uuid, p_window_days int) → attendance pct
--
-- Authorization model:
--   Every per-student RPC verifies the caller is either the student themselves or a parent
--   who has a row in parent_student_links pointing at the student. RLS on the table itself
--   is "self read / self delete only"; inserts go through the linking RPC.

-- ---------------------------------------------------------------------------
-- Table + RLS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.parent_student_links (
  parent_user_id  uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  label           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_user_id, student_user_id),
  CONSTRAINT parent_student_links_no_self CHECK (parent_user_id <> student_user_id)
);

CREATE INDEX IF NOT EXISTS parent_student_links_parent_idx
  ON public.parent_student_links (parent_user_id);
CREATE INDEX IF NOT EXISTS parent_student_links_student_idx
  ON public.parent_student_links (student_user_id);

COMMENT ON TABLE public.parent_student_links IS
  'Multi-student parent dashboard: a parent profile can track up to 3 student profiles. Inserts via parent_link_student RPC.';

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_student_links_select_own ON public.parent_student_links;
CREATE POLICY parent_student_links_select_own
  ON public.parent_student_links
  FOR SELECT TO authenticated
  USING (auth.uid() = parent_user_id);

DROP POLICY IF EXISTS parent_student_links_delete_own ON public.parent_student_links;
CREATE POLICY parent_student_links_delete_own
  ON public.parent_student_links
  FOR DELETE TO authenticated
  USING (auth.uid() = parent_user_id);

GRANT SELECT, DELETE ON public.parent_student_links TO authenticated;

-- ---------------------------------------------------------------------------
-- parent_list_students()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parent_list_students()
RETURNS TABLE (
  student_user_id uuid,
  is_self         boolean,
  full_name       text,
  first_name      text,
  last_name       text,
  mobile_number   text,
  email           text,
  linked_at       timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  RETURN QUERY
  WITH self_row AS (
    SELECT
      p.id                                          AS student_user_id,
      TRUE                                          AS is_self,
      COALESCE(
        NULLIF(trim(p.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
          ''
        )
      )::text                                       AS full_name,
      p.first_name::text                            AS first_name,
      p.last_name::text                             AS last_name,
      pc.mobile_number::text                        AS mobile_number,
      u.email::text                                 AS email,
      NULL::timestamptz                             AS linked_at
    FROM public.profiles p
    LEFT JOIN public.profiles_contact pc ON pc.id = p.id
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = v_user
      AND p.role = 'parent_student'::public.profile_role_v2
  ),
  linked_rows AS (
    SELECT
      p.id                                          AS student_user_id,
      FALSE                                         AS is_self,
      COALESCE(
        NULLIF(trim(p.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
          ''
        )
      )::text                                       AS full_name,
      p.first_name::text                            AS first_name,
      p.last_name::text                             AS last_name,
      pc.mobile_number::text                        AS mobile_number,
      u.email::text                                 AS email,
      l.created_at                                  AS linked_at
    FROM public.parent_student_links l
    INNER JOIN public.profiles         p  ON p.id = l.student_user_id
    LEFT JOIN public.profiles_contact  pc ON pc.id = p.id
    LEFT JOIN auth.users               u  ON u.id = p.id
    WHERE l.parent_user_id = v_user
  )
  SELECT * FROM self_row
  UNION ALL
  SELECT * FROM linked_rows
  ORDER BY is_self DESC, linked_at NULLS FIRST
  LIMIT 3;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_list_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_list_students() TO authenticated;

-- ---------------------------------------------------------------------------
-- parent_link_student(p_identifier text)
--   Identifier may be: an email address, a phone number (any format — last 9 digits compared),
--   or a NIC number. Returns the linked student_user_id on success.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parent_link_student(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent      uuid := auth.uid();
  v_identifier  text := lower(trim(COALESCE(p_identifier, '')));
  v_student     uuid;
  v_norm_phone  text;
  v_linked_cnt  int;
  v_self_count  int;
BEGIN
  IF v_parent IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(v_identifier) = 0 THEN RAISE EXCEPTION 'identifier_required'; END IF;

  -- Cap: self (if parent_student) + linked rows <= 3
  SELECT COUNT(*)::int INTO v_linked_cnt FROM public.parent_student_links WHERE parent_user_id = v_parent;
  SELECT COUNT(*)::int INTO v_self_count FROM public.profiles
    WHERE id = v_parent AND role = 'parent_student'::public.profile_role_v2;
  IF (v_linked_cnt + v_self_count) >= 3 THEN
    RAISE EXCEPTION 'student_limit_reached';
  END IF;

  -- 1) Email match
  SELECT u.id INTO v_student
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = v_identifier
  LIMIT 1;

  -- 2) Mobile match (compare last 9 digits to dodge +94 / 0 prefix differences)
  IF v_student IS NULL THEN
    v_norm_phone := regexp_replace(v_identifier, '\D', '', 'g');
    IF length(v_norm_phone) >= 9 THEN
      SELECT pc.id INTO v_student
      FROM public.profiles_contact pc
      WHERE pc.mobile_number IS NOT NULL
        AND right(regexp_replace(pc.mobile_number, '\D', '', 'g'), 9)
            = right(v_norm_phone, 9)
      LIMIT 1;
    END IF;
  END IF;

  -- 3) NIC match
  IF v_student IS NULL THEN
    SELECT pc.id INTO v_student
    FROM public.profiles_contact pc
    WHERE lower(COALESCE(pc.nic_number, '')) = v_identifier
    LIMIT 1;
  END IF;

  IF v_student IS NULL THEN RAISE EXCEPTION 'student_not_found'; END IF;
  IF v_student = v_parent THEN RAISE EXCEPTION 'cannot_link_self'; END IF;

  -- Verify role
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_student
      AND role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  INSERT INTO public.parent_student_links (parent_user_id, student_user_id)
  VALUES (v_parent, v_student)
  ON CONFLICT (parent_user_id, student_user_id) DO NOTHING;

  RETURN jsonb_build_object('student_user_id', v_student);
END;
$$;

REVOKE ALL ON FUNCTION public.parent_link_student(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_link_student(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- parent_unlink_student(p_student_user_id uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parent_unlink_student(p_student_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.parent_student_links
   WHERE parent_user_id = v_user
     AND student_user_id = p_student_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_unlink_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_unlink_student(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- student_today_schedule(p_student_user_id uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.student_today_schedule(p_student_user_id uuid)
RETURNS TABLE (
  schedule_id        uuid,
  lecture_group_id   uuid,
  group_name         text,
  institute_name     text,
  start_time         text,
  end_time           text,
  kind               text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_dow   int  := EXTRACT(DOW FROM CURRENT_DATE)::int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT
    gs.id                                  AS schedule_id,
    g.id                                   AS lecture_group_id,
    g.name::text                           AS group_name,
    i.name::text                           AS institute_name,
    to_char(gs.start_time, 'HH24:MI')::text AS start_time,
    to_char(gs.end_time,   'HH24:MI')::text AS end_time,
    gs.kind::text                          AS kind
  FROM public.lecture_group_students lgs
  INNER JOIN public.lecture_groups   g  ON g.id  = lgs.lecture_group_id
  INNER JOIN public.institutes       i  ON i.id  = g.institute_id
  INNER JOIN public.group_schedules  gs ON gs.lecture_group_id = g.id
  WHERE lgs.student_user_id = p_student_user_id
    AND (
      (gs.kind = 'recurring_weekly'::public.group_schedule_kind AND gs.day_of_week = v_dow)
      OR (gs.kind = 'one_time'::public.group_schedule_kind     AND gs.class_date = v_today)
    )
  ORDER BY gs.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.student_today_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_today_schedule(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- student_attendance_summary(p_student_user_id uuid, p_window_days int)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.student_attendance_summary(
  p_student_user_id uuid,
  p_window_days     int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_total   int  := 0;
  v_present int  := 0;
  v_window  int  := GREATEST(LEAST(COALESCE(p_window_days, 30), 365), 7);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    v_user = p_student_user_id
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links
      WHERE parent_user_id = v_user AND student_user_id = p_student_user_id
    )
  ) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE m.present)::int
  INTO v_total, v_present
  FROM public.group_attendance_marks m
  INNER JOIN public.group_attendance_sessions s ON s.id = m.session_id
  WHERE m.student_user_id = p_student_user_id
    AND s.session_date >= (CURRENT_DATE - (v_window || ' day')::interval);

  RETURN jsonb_build_object(
    'total',       v_total,
    'present',     v_present,
    'percentage',  CASE WHEN v_total = 0 THEN NULL
                        ELSE round((v_present * 100.0 / v_total)::numeric, 1) END,
    'window_days', v_window
  );
END;
$$;

REVOKE ALL ON FUNCTION public.student_attendance_summary(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_attendance_summary(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
