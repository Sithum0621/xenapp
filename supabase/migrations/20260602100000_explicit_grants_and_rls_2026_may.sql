-- May 2026 Supabase security update: new projects no longer ship default GRANTs for `anon`
-- and `authenticated`, and publishable anon keys (`sb_publishable_…`) replace the legacy JWT
-- anon key. RLS still governs *which rows* a user can access; this migration ensures the
-- table-level GRANT layer is also in place for every public.* table this app uses, and that
-- RLS is enabled wherever it should be.
--
-- This migration is idempotent: it can be run on a project where some grants / RLS are already
-- present without breaking anything.

-- ---------------------------------------------------------------------------
-- Schema usage
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table-level grants for `authenticated` (gated by RLS policies)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  app_tables text[] := ARRAY[
    'profiles',
    'institutes',
    'institute_teacher_membership',
    'institute_student_membership',
    'subscriptions',
    'profile_app_lock',
    'lecture_groups',
    'lecture_group_teachers',
    'lecture_group_students',
    'teacher_personal_groups',
    'teacher_personal_roster_entries',
    'group_schedules',
    'group_attendance_sessions',
    'group_attendance_marks',
    'group_payment_records',
    'teacher_group_mcq_questions',
    'teacher_group_mcq_options',
    'superadmin_mfa_challenges'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND c.relname = t
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- Sequences used by SERIAL / IDENTITY columns must be usable by writers.
-- ---------------------------------------------------------------------------
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- Execute on every existing public function (RPCs, helpers). New functions added
-- after this migration still need GRANT in their own migrations; this just normalizes
-- the existing surface.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- Default privileges so any future objects we (the migrations role) create are
-- immediately usable by `authenticated`. RLS still gates row-level visibility.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ---------------------------------------------------------------------------
-- `anon` deliberately receives no table grants — every read in this app requires
-- a signed-in user (see LoginScreen + RLS policies). If/when a public-read table
-- is introduced, grant SELECT explicitly in its own migration.
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
