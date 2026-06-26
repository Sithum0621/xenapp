-- One-off backfill: teacher-invited students that were registered before the synthetic-email
-- change had a phone-only auth row (auth.users.phone set, auth.users.email NULL). The app now
-- signs in by email only (see src/utils/loginIdentifier.ts + teacher-student-enroll edge fn),
-- so those legacy rows would otherwise fail with "invalid login credentials".
--
-- We attach a deterministic synthetic email matching the client formula and mark it confirmed,
-- so logging in with the same phone number works through Supabase's email provider.
--
-- Domain MUST match SYNTHETIC_PHONE_EMAIL_DOMAIN in
--   - src/utils/loginIdentifier.ts
--   - supabase/functions/teacher-student-enroll/index.ts

UPDATE auth.users
SET
  email = 'wovello-' || regexp_replace(phone, '\D', '', 'g') || '@phone.wovello.app',
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'login_phone', COALESCE(raw_user_meta_data->>'login_phone', phone),
      'synthetic_email', 'true'
    )
WHERE phone IS NOT NULL
  AND length(trim(phone)) > 0
  AND (email IS NULL OR length(trim(email)) = 0)
  AND COALESCE(raw_user_meta_data->>'teacher_invited', '') = 'true';

-- Optional: mirror onto profiles.mobile_number for any legacy rows missing it (defensive).
UPDATE public.profiles p
SET mobile_number = u.phone
FROM auth.users u
WHERE p.id = u.id
  AND u.phone IS NOT NULL
  AND length(trim(u.phone)) > 0
  AND (p.mobile_number IS NULL OR length(trim(p.mobile_number)) = 0)
  AND COALESCE(u.raw_user_meta_data->>'teacher_invited', '') = 'true';

NOTIFY pgrst, 'reload schema';
