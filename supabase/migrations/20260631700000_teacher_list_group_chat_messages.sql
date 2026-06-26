-- Teachers: list messages for a group they teach (overview → group chat).

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

REVOKE ALL ON FUNCTION public.teacher_list_group_chat_messages(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_list_group_chat_messages(uuid, text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
