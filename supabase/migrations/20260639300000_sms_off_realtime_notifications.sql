-- Enable Realtime so PWA/web clients can show notification popups while the app is open.
-- (Native apps still use FCM; this does not replace background push.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- New SMS accounts default to channels off (push-only until SMS is re-enabled globally).
ALTER TABLE public.teacher_sms_accounts
  ALTER COLUMN attendance_sms_enabled SET DEFAULT false,
  ALTER COLUMN payments_sms_enabled SET DEFAULT false;

UPDATE public.teacher_sms_accounts
SET
  attendance_sms_enabled = false,
  payments_sms_enabled = false
WHERE attendance_sms_enabled IS DISTINCT FROM false
   OR payments_sms_enabled IS DISTINCT FROM false;

NOTIFY pgrst, 'reload schema';
