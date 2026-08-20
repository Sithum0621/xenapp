-- Community chat display name: XEN Community → MyTuition Community.

COMMENT ON TABLE public.community_chat_messages IS
  'Platform-wide MyTuition Community chat. Any authenticated user may read and post.';

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
    'MyTuition Community'::text,
    m.body,
    m.created_at,
    coalesce(nullif(trim(p.full_name), ''), 'User')
  FROM public.community_chat_messages m
  INNER JOIN public.profiles p ON p.id = m.sender_user_id
  ORDER BY m.created_at DESC
  LIMIT 1;
$$;
