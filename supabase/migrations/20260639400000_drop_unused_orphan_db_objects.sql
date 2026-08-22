-- Safe cleanup: drop unused orphan objects only.
-- Does NOT touch live features (XEN columns, SMS tables, profiles_contact mirrors,
-- membership/junction tables, class cards, notifications, wallets, etc.).

-- 1) 2-hour class reminder dispatch log — writer is a no-op since
--    20260635700000_disable_class_2h_reminders.sql; live class notices use
--    class_daily_schedule_dispatches instead.
DROP TABLE IF EXISTS public.class_reminder_dispatches;

-- Keep process_class_start_reminders() as the existing no-op stub so any leftover
-- cron / Edge invoke does not error.

-- 2) Unused device-trial helper (app never calls it; trial path already removed).
DROP FUNCTION IF EXISTS public.device_has_registered_profile(text);

-- 3) Unused XEN login-email resolver (client helper has no callers; login uses
--    phone/email identifiers instead).
DROP FUNCTION IF EXISTS public.resolve_student_login_email(text);

NOTIFY pgrst, 'reload schema';
