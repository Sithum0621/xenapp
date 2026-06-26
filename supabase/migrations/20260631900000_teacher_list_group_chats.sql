-- Teachers: list assigned groups with latest chat preview (Classes tab chat inbox).

CREATE OR REPLACE FUNCTION public.teacher_list_group_chats()
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
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
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
    FROM public.lecture_groups g
    LEFT JOIN public.institutes i ON i.id = g.institute_id
    LEFT JOIN public.lecture_group_teachers gt
      ON gt.lecture_group_id = g.id
      AND gt.teacher_user_id = v_uid
    WHERE g.primary_teacher_user_id = v_uid
      OR gt.teacher_user_id IS NOT NULL

    UNION ALL

    SELECT
      pg.id AS group_id,
      'personal'::text AS group_source,
      pg.name::text AS group_name,
      ''::text AS institute_name
    FROM public.teacher_personal_groups pg
    WHERE pg.teacher_user_id = v_uid
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
  ORDER BY lm.created_at DESC NULLS LAST, lower(e.group_name);
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_list_group_chats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_list_group_chats() TO authenticated;

NOTIFY pgrst, 'reload schema';
