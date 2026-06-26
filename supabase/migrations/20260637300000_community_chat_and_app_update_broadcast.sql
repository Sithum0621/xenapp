-- XEN Community chat (open to all signed-in users) + superadmin app-update broadcast.

CREATE TABLE IF NOT EXISTS public.community_chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_body_nonempty CHECK (length(trim(body)) > 0),
  CONSTRAINT community_chat_body_maxlen CHECK (length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS community_chat_messages_created_idx
  ON public.community_chat_messages (created_at DESC);

COMMENT ON TABLE public.community_chat_messages IS
  'Platform-wide XEN Community chat. Any authenticated user may read and post.';

ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.community_chat_summary()
RETURNS TABLE (
  title              text,
  last_message_body  text,
  last_message_at    timestamptz,
  last_sender_name   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'XEN Community'::text,
    m.body,
    m.created_at,
    coalesce(nullif(trim(p.full_name), ''), 'User')
  FROM public.community_chat_messages m
  INNER JOIN public.profiles p ON p.id = m.sender_user_id
  ORDER BY m.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.community_chat_list_messages(
  p_limit integer DEFAULT 120
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lim  int := greatest(1, least(coalesce(p_limit, 120), 300));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.body,
    m.created_at,
    m.sender_user_id,
    coalesce(nullif(trim(p.full_name), ''), 'User')::text,
    p.role::text,
    (m.sender_user_id = v_user)
  FROM public.community_chat_messages m
  INNER JOIN public.profiles p ON p.id = m.sender_user_id
  ORDER BY m.created_at ASC
  LIMIT v_lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_chat_send_message(
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF length(v_body) = 0 THEN
    RAISE EXCEPTION 'message_empty';
  END IF;

  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user) THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  INSERT INTO public.community_chat_messages (sender_user_id, body)
  VALUES (v_user, v_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_broadcast_app_update_notification(
  p_custom_body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_release jsonb;
  v_title   text := 'App update available';
  v_body    text;
  v_user    uuid;
  v_count   int := 0;
  v_version text;
  v_code    int;
  v_notes   text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_superadmin';
  END IF;

  v_release := public.get_current_android_app_release();
  IF v_release IS NULL OR v_release->>'version_name' IS NULL THEN
    RAISE EXCEPTION 'no_current_release';
  END IF;

  v_version := v_release->>'version_name';
  v_code := (v_release->>'version_code')::int;
  v_notes := coalesce(v_release->>'release_notes', '');

  v_body := coalesce(
    nullif(trim(p_custom_body), ''),
    format(
      'XEN %s is ready to install. Open Settings → App update to download the latest version.',
      v_version
    )
  );

  FOR v_user IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role IN (
      'parent_student'::public.profile_role_v2,
      'teacher'::public.profile_role_v2,
      'admin'::public.profile_role_v2
    )
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_user,
      v_title,
      v_body,
      jsonb_build_object(
        'type', 'app_update',
        'version_name', v_version,
        'version_code', v_code,
        'release_notes', v_notes,
        'route', '/parent-dashboard/settings/app-update'
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'notifications_sent', v_count,
    'version_name', v_version,
    'version_code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_chat_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_chat_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.community_chat_list_messages(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_chat_list_messages(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.community_chat_send_message(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_chat_send_message(text) TO authenticated;

REVOKE ALL ON FUNCTION public.superadmin_broadcast_app_update_notification(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_broadcast_app_update_notification(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
