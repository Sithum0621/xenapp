-- Disable 2-hour "Class starting in 2 hours" push reminders.
-- Daily "Class today" notifications (process_daily_class_schedule_notifications) remain active.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('wovello-class-reminders-2h');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$cron$;

CREATE OR REPLACE FUNCTION public.process_class_start_reminders(
  p_timezone text DEFAULT 'Asia/Colombo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Colombo');
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'disabled', true,
    'reason', 'two_hour_reminders_disabled',
    'timezone', v_tz,
    'occurrences_in_window', 0,
    'notifications_sent', 0
  );
END;
$$;

COMMENT ON FUNCTION public.process_class_start_reminders(text) IS
  'Disabled: 2-hour class reminders turned off. Use process_daily_class_schedule_notifications for same-day class notices.';

REVOKE ALL ON FUNCTION public.process_class_start_reminders(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_class_start_reminders(text) TO service_role;

NOTIFY pgrst, 'reload schema';
