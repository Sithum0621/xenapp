-- Track device sessions for concurrent login + security notifications (no session revocation).

CREATE TABLE IF NOT EXISTS public.user_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_label text NOT NULL DEFAULT 'Unknown device',
  platform text NOT NULL DEFAULT 'unknown',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  email_notified_at timestamptz,
  CONSTRAINT user_device_sessions_user_device_unique UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS user_device_sessions_user_id_idx
  ON public.user_device_sessions (user_id, last_seen_at DESC);

COMMENT ON TABLE public.user_device_sessions IS
  'Known devices per user for login security alerts; does not limit concurrent Supabase Auth sessions.';

ALTER TABLE public.user_device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_device_sessions_select_own ON public.user_device_sessions;
CREATE POLICY user_device_sessions_select_own
  ON public.user_device_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.user_device_sessions TO authenticated;

NOTIFY pgrst, 'reload schema';
