-- Purge all application data except superadmin account(s).
-- Keeps table structures, functions, RLS, and the superadmin auth user + profile row.
-- Run: npx supabase db query --linked --file supabase/scripts/purge_non_superadmin_data.sql

BEGIN;

DO $$
DECLARE
  v_superadmin_count int;
  v_deleted_auth     bigint;
BEGIN
  SELECT count(*)::int
  INTO v_superadmin_count
  FROM public.profiles p
  WHERE p.role = 'superadmin'::public.profile_role_v2;

  IF v_superadmin_count = 0 THEN
    RAISE EXCEPTION 'Aborting: no profile with role superadmin found';
  END IF;

  -- Detach non-superadmin profiles from institutes so institutes can be truncated.
  UPDATE public.profiles p
  SET institute_id = NULL
  WHERE p.role IS DISTINCT FROM 'superadmin'::public.profile_role_v2
    AND p.institute_id IS NOT NULL;

  -- Operational / domain tables (no superadmin-owned rows to preserve).
  TRUNCATE TABLE
    public.games_schedule_event_attempt_answers,
    public.games_schedule_event_attempts,
    public.games_schedule_event_questions,
    public.games_schedule_events,
    public.games_schedule_subjects,
    public.group_attendance_marks,
    public.group_attendance_sessions,
    public.group_chat_messages,
    public.group_payment_records,
    public.group_schedules,
    public.teacher_group_mcq_options,
    public.teacher_group_mcq_questions,
    public.lecture_group_delivery,
    public.lecture_group_students,
    public.lecture_group_teachers,
    public.lecture_groups,
    public.teacher_personal_roster_entries,
    public.teacher_personal_groups,
    public.institute_student_membership,
    public.institute_teacher_membership,
    public.parent_student_links,
    public.premium_class_card_requests,
    public.student_leaderboard_entries,
    public.student_wallet_transactions,
    public.student_wallets
  RESTART IDENTITY;

  -- institutes is referenced by profiles.institute_id (nullable); DELETE avoids truncating profiles.
  DELETE FROM public.institutes;

  -- Per-user rows: remove everyone except superadmin.
  DELETE FROM public.notifications n
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = n.user_id
      AND p.role = 'superadmin'::public.profile_role_v2
  );

  DELETE FROM public.user_device_tokens t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = t.user_id
      AND p.role = 'superadmin'::public.profile_role_v2
  );

  DELETE FROM public.superadmin_mfa_challenges c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = c.user_id
      AND p.role = 'superadmin'::public.profile_role_v2
  );

  -- Auth users (cascades profiles, profiles_contact, subscriptions, profile_app_lock for deleted users).
  DELETE FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = u.id
      AND p.role = 'superadmin'::public.profile_role_v2
  );

  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    INNER JOIN public.profiles p ON p.id = u.id
    WHERE p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'Aborting: superadmin auth user missing after purge';
  END IF;

  -- Reset monotonic student ID allocator for a clean slate.
  IF to_regclass('public.xen_student_number_seq') IS NOT NULL THEN
    PERFORM setval('public.xen_student_number_seq', 1, false);
  END IF;

  RAISE NOTICE 'Purge complete. Removed % non-superadmin auth user(s). Kept % superadmin profile(s).',
    v_deleted_auth, v_superadmin_count;
END;
$$;

COMMIT;
