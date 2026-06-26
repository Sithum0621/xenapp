-- Group chat messages for institute lecture groups and teacher personal groups.

CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_group_id uuid REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  teacher_personal_group_id uuid REFERENCES public.teacher_personal_groups (id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gcm_body_nonempty CHECK (length(trim(body)) > 0),
  CONSTRAINT gcm_group_xor CHECK (
    (lecture_group_id IS NOT NULL AND teacher_personal_group_id IS NULL)
    OR (lecture_group_id IS NULL AND teacher_personal_group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS gcm_lecture_created_idx
  ON public.group_chat_messages (lecture_group_id, created_at DESC)
  WHERE lecture_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gcm_personal_created_idx
  ON public.group_chat_messages (teacher_personal_group_id, created_at DESC)
  WHERE teacher_personal_group_id IS NOT NULL;

COMMENT ON TABLE public.group_chat_messages IS
  'Broadcast-style messages for a class group. Teachers and institute admins may post; students/parents read.';

ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.chat_user_can_send()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('teacher'::public.profile_role_v2, 'admin'::public.profile_role_v2)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_parent_may_read_group(
  p_student_user_id uuid,
  p_group_id          uuid,
  p_group_source      text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF v_user IS NULL OR p_group_id IS NULL THEN RETURN false; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN RETURN false; END IF;

  IF v_source = 'personal' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.teacher_personal_roster_entries r
      WHERE r.student_user_id = p_student_user_id
        AND r.teacher_personal_group_id = p_group_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.lecture_group_students lgs
    WHERE lgs.student_user_id = p_student_user_id
      AND lgs.lecture_group_id = p_group_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_teacher_may_access_group(
  p_group_id     uuid,
  p_group_source text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF p_group_id IS NULL THEN RETURN false; END IF;
  IF v_source = 'personal' THEN
    RETURN public.teacher_owns_personal_group(p_group_id);
  END IF;
  RETURN public.teacher_can_access_lecture_group(p_group_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.parent_list_group_chats(p_student_user_id uuid)
RETURNS TABLE (
  group_id           uuid,
  group_source       text,
  group_name         text,
  institute_name     text,
  last_message_body  text,
  last_message_at    timestamptz,
  last_sender_name   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    e.group_id,
    e.group_source,
    e.group_name,
    e.institute_name,
    lm.body::text AS last_message_body,
    lm.created_at AS last_message_at,
    lm.sender_name::text AS last_sender_name
  FROM (
    SELECT
      g.id AS group_id,
      'institute'::text AS group_source,
      g.name::text AS group_name,
      COALESCE(i.name, '')::text AS institute_name
    FROM public.lecture_group_students lgs
    INNER JOIN public.lecture_groups g ON g.id = lgs.lecture_group_id
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    WHERE lgs.student_user_id = p_student_user_id

    UNION ALL

    SELECT
      pg.id AS group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      COALESCE(
        NULLIF(trim(tp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(tp.first_name), ''), NULLIF(trim(tp.last_name), '')),
          ''
        ),
        'Teacher'
      )::text AS institute_name
    FROM public.teacher_personal_roster_entries r
    INNER JOIN public.teacher_personal_groups pg ON pg.id = r.teacher_personal_group_id
    LEFT JOIN public.profiles tp ON tp.id = pg.teacher_user_id
    WHERE r.student_user_id = p_student_user_id
  ) e
  LEFT JOIN LATERAL (
    SELECT
      m.body,
      m.created_at,
      COALESCE(
        NULLIF(trim(sp.full_name), ''),
        NULLIF(
          CONCAT_WS(' ', NULLIF(trim(sp.first_name), ''), NULLIF(trim(sp.last_name), '')),
          ''
        ),
        'Member'
      ) AS sender_name
    FROM public.group_chat_messages m
    INNER JOIN public.profiles sp ON sp.id = m.sender_user_id
    WHERE (
      (e.group_source = 'institute' AND m.lecture_group_id = e.group_id)
      OR (e.group_source = 'personal' AND m.teacher_personal_group_id = e.group_id)
    )
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  ORDER BY lower(e.group_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.parent_list_group_chat_messages(
  p_student_user_id uuid,
  p_group_id        uuid,
  p_group_source    text DEFAULT 'institute',
  p_limit           int DEFAULT 80
)
RETURNS TABLE (
  id           uuid,
  body         text,
  created_at   timestamptz,
  sender_id    uuid,
  sender_name  text,
  sender_role  text,
  is_mine      boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_limit  int  := GREATEST(LEAST(COALESCE(p_limit, 80), 200), 1);
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.chat_parent_may_read_group(p_student_user_id, p_group_id, v_source) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.body::text,
    m.created_at,
    m.sender_user_id AS sender_id,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      NULLIF(
        CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
        ''
      ),
      'Member'
    )::text AS sender_name,
    p.role::text AS sender_role,
    (m.sender_user_id = v_user) AS is_mine
  FROM public.group_chat_messages m
  INNER JOIN public.profiles p ON p.id = m.sender_user_id
  WHERE (
    (v_source = 'institute' AND m.lecture_group_id = p_group_id)
    OR (v_source = 'personal' AND m.teacher_personal_group_id = p_group_id)
  )
  ORDER BY m.created_at ASC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_send_group_message(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute',
  p_body         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_body   text := trim(COALESCE(p_body, ''));
  v_id     uuid;
  v_admin  boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'message_empty'; END IF;
  IF NOT public.chat_user_can_send() THEN RAISE EXCEPTION 'not_allowed_to_send'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user AND role = 'admin'::public.profile_role_v2
  ) INTO v_admin;

  IF v_source = 'personal' THEN
    IF v_admin THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.teacher_personal_groups WHERE id = p_group_id
      ) THEN
        RAISE EXCEPTION 'group_not_found';
      END IF;
    ELSIF NOT public.teacher_owns_personal_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO public.group_chat_messages (
      teacher_personal_group_id,
      sender_user_id,
      body
    )
    VALUES (p_group_id, v_user, v_body)
    RETURNING id INTO v_id;
  ELSE
    IF v_admin THEN
      IF NOT EXISTS (SELECT 1 FROM public.lecture_groups WHERE id = p_group_id) THEN
        RAISE EXCEPTION 'group_not_found';
      END IF;
    ELSIF NOT public.teacher_can_access_lecture_group(p_group_id) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    INSERT INTO public.group_chat_messages (
      lecture_group_id,
      sender_user_id,
      body
    )
    VALUES (p_group_id, v_user, v_body)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_user_can_send() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_user_can_send() TO authenticated;

REVOKE ALL ON FUNCTION public.parent_list_group_chats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_list_group_chats(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.parent_list_group_chat_messages(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_list_group_chat_messages(uuid, uuid, text, int) TO authenticated;

REVOKE ALL ON FUNCTION public.chat_send_group_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_send_group_message(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
