-- Push notifications: device tokens, in-app notifications, and pg_net webhook trigger for FCM.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Device tokens (FCM registration tokens per user/device)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_token text NOT NULL,
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  invalidated_at timestamptz,
  CONSTRAINT user_device_tokens_user_token_unique UNIQUE (user_id, device_token)
);

CREATE INDEX IF NOT EXISTS user_device_tokens_user_id_idx
  ON public.user_device_tokens (user_id)
  WHERE invalidated_at IS NULL;

ALTER TABLE public.user_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_device_tokens_select_own
  ON public.user_device_tokens
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_device_tokens_insert_own
  ON public.user_device_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_device_tokens_update_own
  ON public.user_device_tokens
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_device_tokens_delete_own
  ON public.user_device_tokens
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications (in-app + push trigger source)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  push_sent_at timestamptz,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts are typically service-role / backend; authenticated users cannot forge others' rows.
CREATE POLICY notifications_insert_own
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Register / refresh FCM token from the mobile app
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_device_token text,
  p_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_token text := nullif(trim(p_device_token), '');
  v_platform text := nullif(trim(lower(p_platform)), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'device_token_required';
  END IF;

  IF v_platform IS NOT NULL AND v_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  INSERT INTO public.user_device_tokens (user_id, device_token, platform, invalidated_at)
  VALUES (v_user, v_token, v_platform, NULL)
  ON CONFLICT (user_id, device_token)
  DO UPDATE SET
    platform = COALESCE(EXCLUDED.platform, public.user_device_tokens.platform),
    updated_at = now(),
    last_used_at = now(),
    invalidated_at = NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- pg_net trigger → Edge Function send-push-notification
-- Configure Vault secrets once (Supabase Dashboard → Project Settings → Vault):
--   push_notification_url  = https://<project-ref>.supabase.co/functions/v1/send-push-notification
--   push_webhook_secret    = same value as Edge Function secret PUSH_WEBHOOK_SECRET
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'push_notification_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_webhook_secret'
  LIMIT 1;

  IF v_url IS NULL OR v_url = '' THEN
    RAISE WARNING 'push_notification_url vault secret missing; skipping FCM dispatch for notification %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;

CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();

NOTIFY pgrst, 'reload schema';
