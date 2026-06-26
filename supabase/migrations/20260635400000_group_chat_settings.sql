-- Group chat: teacher display name + per-group avatar.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_display_name text;

COMMENT ON COLUMN public.profiles.chat_display_name IS
  'Optional name shown to students/parents in group chat (teachers).';

ALTER TABLE public.lecture_groups
  ADD COLUMN IF NOT EXISTS chat_avatar_path text;

ALTER TABLE public.teacher_personal_groups
  ADD COLUMN IF NOT EXISTS chat_avatar_path text;

COMMENT ON COLUMN public.lecture_groups.chat_avatar_path IS
  'Storage path in group-chat-avatars bucket for group chat profile image.';
COMMENT ON COLUMN public.teacher_personal_groups.chat_avatar_path IS
  'Storage path in group-chat-avatars bucket for group chat profile image.';

CREATE OR REPLACE FUNCTION public.profile_chat_sender_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(p.chat_display_name), ''),
    NULLIF(trim(p.full_name), ''),
    NULLIF(
      CONCAT_WS(' ', NULLIF(trim(p.first_name), ''), NULLIF(trim(p.last_name), '')),
      ''
    ),
    'Member'
  )
  FROM public.profiles p
  WHERE p.id = p_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.teacher_list_group_chat_messages(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute',
  p_limit        int DEFAULT 120
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
  v_limit  int  := GREATEST(LEAST(COALESCE(p_limit, 120), 200), 1);
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.chat_teacher_may_access_group(p_group_id, v_source) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.body::text,
    m.created_at,
    m.sender_user_id AS sender_id,
    public.profile_chat_sender_name(m.sender_user_id)::text AS sender_name,
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
    public.profile_chat_sender_name(m.sender_user_id)::text AS sender_name,
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

CREATE OR REPLACE FUNCTION public.teacher_get_group_chat_settings(
  p_group_id     uuid,
  p_group_source text DEFAULT 'institute'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_name   text;
  v_avatar text;
  v_chat   text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.chat_teacher_may_access_group(p_group_id, v_source) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT NULLIF(trim(p.chat_display_name), '')
  INTO v_chat
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_source = 'personal' THEN
    SELECT pg.name, NULLIF(trim(pg.chat_avatar_path), '')
    INTO v_name, v_avatar
    FROM public.teacher_personal_groups pg
    WHERE pg.id = p_group_id;
  ELSE
    SELECT lg.name, NULLIF(trim(lg.chat_avatar_path), '')
    INTO v_name, v_avatar
    FROM public.lecture_groups lg
    WHERE lg.id = p_group_id;
  END IF;

  RETURN jsonb_build_object(
    'group_name', COALESCE(v_name, ''),
    'chat_display_name', COALESCE(v_chat, ''),
    'chat_avatar_path', COALESCE(v_avatar, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_update_chat_display_name(p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text := trim(COALESCE(p_display_name, ''));
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'display_name_too_long';
  END IF;

  UPDATE public.profiles
  SET chat_display_name = NULLIF(v_name, '')
  WHERE id = v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.teacher_update_group_chat_avatar_path(
  p_group_id     uuid,
  p_group_source text,
  p_avatar_path  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_source text := lower(trim(COALESCE(p_group_source, 'institute')));
  v_path   text := NULLIF(trim(COALESCE(p_avatar_path, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.chat_teacher_may_access_group(p_group_id, v_source) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_source = 'personal' THEN
    UPDATE public.teacher_personal_groups
    SET chat_avatar_path = v_path
    WHERE id = p_group_id;
  ELSE
    UPDATE public.lecture_groups
    SET chat_avatar_path = v_path
    WHERE id = p_group_id;
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-chat-avatars',
  'group-chat-avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY group_chat_avatars_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'group-chat-avatars');

CREATE POLICY group_chat_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-chat-avatars'
    AND (
      (
        split_part(name, '/', 1) = 'institute'
        AND public.teacher_can_access_lecture_group((split_part(name, '/', 2))::uuid)
      )
      OR (
        split_part(name, '/', 1) = 'personal'
        AND public.teacher_owns_personal_group((split_part(name, '/', 2))::uuid)
      )
    )
  );

CREATE POLICY group_chat_avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'group-chat-avatars'
    AND (
      (
        split_part(name, '/', 1) = 'institute'
        AND public.teacher_can_access_lecture_group((split_part(name, '/', 2))::uuid)
      )
      OR (
        split_part(name, '/', 1) = 'personal'
        AND public.teacher_owns_personal_group((split_part(name, '/', 2))::uuid)
      )
    )
  );

REVOKE ALL ON FUNCTION public.profile_chat_sender_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_chat_sender_name(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_get_group_chat_settings(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_get_group_chat_settings(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_update_chat_display_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_update_chat_display_name(text) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_update_group_chat_avatar_path(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_update_group_chat_avatar_path(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
