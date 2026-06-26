-- Schedule class-start reminders every 5 minutes (requires pg_cron on the Supabase project).
-- Enable under Dashboard → Database → Extensions → pg_cron, then apply this migration.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('wovello-class-reminders-2h');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'wovello-class-reminders-2h',
      '*/5 * * * *',
      $$SELECT public.process_class_start_reminders('Asia/Colombo')$$
    );
  END IF;
END;
$cron$;
