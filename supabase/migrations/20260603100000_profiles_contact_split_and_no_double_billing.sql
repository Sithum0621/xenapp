-- Three changes, applied as one logical migration:
--   (1) No double-billing: partial unique indexes on group_payment_records.
--   (2) Profiles split (non-destructive): NEW table public.profiles_contact for sensitive contact data,
--       and a VIEW public.profiles_core exposing identity-only columns of public.profiles.
--       Bidirectional sync triggers keep public.profiles.{mobile_number, nic_number, address,
--       password_created_at, temp_password_expires_at} in lockstep with public.profiles_contact during
--       the frontend transition. Old code keeps working; new code uses the new tables.
--   (3) FK audit: no missing FKs across application tables — verified manually against migrations
--       20260501192000, 20260515100000, 20260517120000, 20260523110000, 20260528120000, 20260530120000.
--       This migration adds nothing new there; documenting the audit at the bottom of the file.

-- ---------------------------------------------------------------------------
-- (1) No double-billing: partial unique indexes on group_payment_records
--
--     Two patterns are billed in the schema (XOR enforced by gpr_group_xor / gpr_student_xor):
--       a) Lecture group + institute student profile: (lecture_group_id, student_user_id, billing_month)
--       b) Teacher personal group + personal roster entry: (teacher_personal_group_id, personal_roster_id, billing_month)
--     Each pair must be unique per billing month. Pending and collected rows for the same month
--     would still collide here — collected rows clear pending via UPDATE, never via duplicate INSERT.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS gpr_lecture_student_month_unique
  ON public.group_payment_records (lecture_group_id, student_user_id, billing_month)
  WHERE lecture_group_id IS NOT NULL AND student_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gpr_personal_roster_month_unique
  ON public.group_payment_records (teacher_personal_group_id, personal_roster_id, billing_month)
  WHERE teacher_personal_group_id IS NOT NULL AND personal_roster_id IS NOT NULL;

COMMENT ON INDEX public.gpr_lecture_student_month_unique IS
  'No double-billing: one row per (lecture group, institute student, billing month).';
COMMENT ON INDEX public.gpr_personal_roster_month_unique IS
  'No double-billing: one row per (teacher personal group, personal roster entry, billing month).';

-- ---------------------------------------------------------------------------
-- (2a) profiles_contact: NEW table for sensitive contact data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles_contact (
  id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  mobile_number text,
  nic_number text,
  address text,
  password_created_at timestamptz,
  temp_password_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles_contact IS
  'Sensitive contact data for a profile (phone, NIC, address, temp-password expiry). 1:1 with public.profiles.';
COMMENT ON COLUMN public.profiles_contact.mobile_number IS
  'Display / verification phone. Sri Lankan canonical format: 07XXXXXXXX.';
COMMENT ON COLUMN public.profiles_contact.nic_number IS
  'National Identity Card number; normalized & validated upstream by profiles_validate_nic_format.';

CREATE INDEX IF NOT EXISTS profiles_contact_mobile_idx
  ON public.profiles_contact (mobile_number)
  WHERE mobile_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_contact_nic_idx
  ON public.profiles_contact (nic_number)
  WHERE nic_number IS NOT NULL;

-- updated_at maintenance trigger
CREATE OR REPLACE FUNCTION public.profiles_contact_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_contact_updated_at ON public.profiles_contact;
CREATE TRIGGER profiles_contact_updated_at
BEFORE UPDATE ON public.profiles_contact
FOR EACH ROW
EXECUTE FUNCTION public.profiles_contact_set_updated_at();

-- ---------------------------------------------------------------------------
-- (2b) Backfill profiles_contact from existing profiles rows
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles_contact (
  id,
  mobile_number,
  nic_number,
  address,
  password_created_at,
  temp_password_expires_at
)
SELECT
  p.id,
  NULLIF(trim(COALESCE(p.mobile_number, '')), ''),
  NULLIF(trim(COALESCE(p.nic_number, '')), ''),
  NULLIF(trim(COALESCE(p.address, '')), ''),
  p.password_created_at,
  p.temp_password_expires_at
FROM public.profiles p
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (2c) Auto-create matching profiles_contact row whenever a new profile row appears
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_after_insert_create_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles_contact (
    id,
    mobile_number,
    nic_number,
    address,
    password_created_at,
    temp_password_expires_at
  )
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.mobile_number, '')), ''),
    NULLIF(trim(COALESCE(NEW.nic_number, '')), ''),
    NULLIF(trim(COALESCE(NEW.address, '')), ''),
    NEW.password_created_at,
    NEW.temp_password_expires_at
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_after_insert_create_contact_trg ON public.profiles;
CREATE TRIGGER profiles_after_insert_create_contact_trg
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_after_insert_create_contact();

-- ---------------------------------------------------------------------------
-- (2d) Bidirectional sync triggers (transition period)
--      Writes to profiles.{contact cols} → mirror to profiles_contact.
--      Writes to profiles_contact → mirror back to profiles.
--      Both triggers gate on actual value change to prevent infinite recursion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_after_update_sync_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mobile  text := NULLIF(trim(COALESCE(NEW.mobile_number, '')), '');
  v_nic     text := NULLIF(trim(COALESCE(NEW.nic_number, '')), '');
  v_addr    text := NULLIF(trim(COALESCE(NEW.address, '')), '');
BEGIN
  -- Skip if none of the synced columns changed (cheap NULL-safe compares).
  IF NEW.mobile_number IS NOT DISTINCT FROM OLD.mobile_number
     AND NEW.nic_number IS NOT DISTINCT FROM OLD.nic_number
     AND NEW.address    IS NOT DISTINCT FROM OLD.address
     AND NEW.password_created_at      IS NOT DISTINCT FROM OLD.password_created_at
     AND NEW.temp_password_expires_at IS NOT DISTINCT FROM OLD.temp_password_expires_at
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles_contact AS pc (
    id, mobile_number, nic_number, address, password_created_at, temp_password_expires_at
  )
  VALUES (
    NEW.id, v_mobile, v_nic, v_addr, NEW.password_created_at, NEW.temp_password_expires_at
  )
  ON CONFLICT (id) DO UPDATE
  SET
    mobile_number            = EXCLUDED.mobile_number,
    nic_number               = EXCLUDED.nic_number,
    address                  = EXCLUDED.address,
    password_created_at      = EXCLUDED.password_created_at,
    temp_password_expires_at = EXCLUDED.temp_password_expires_at
  WHERE
    pc.mobile_number            IS DISTINCT FROM EXCLUDED.mobile_number
    OR pc.nic_number             IS DISTINCT FROM EXCLUDED.nic_number
    OR pc.address                IS DISTINCT FROM EXCLUDED.address
    OR pc.password_created_at      IS DISTINCT FROM EXCLUDED.password_created_at
    OR pc.temp_password_expires_at IS DISTINCT FROM EXCLUDED.temp_password_expires_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_after_update_sync_contact_trg ON public.profiles;
CREATE TRIGGER profiles_after_update_sync_contact_trg
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_after_update_sync_contact();

CREATE OR REPLACE FUNCTION public.profiles_contact_after_write_sync_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT or UPDATE of profiles_contact, mirror back to profiles only if values differ.
  -- This keeps legacy callers that still read public.profiles.* consistent.
  UPDATE public.profiles p
  SET
    mobile_number            = NEW.mobile_number,
    nic_number               = NEW.nic_number,
    address                  = NEW.address,
    password_created_at      = NEW.password_created_at,
    temp_password_expires_at = NEW.temp_password_expires_at
  WHERE p.id = NEW.id
    AND (
      p.mobile_number            IS DISTINCT FROM NEW.mobile_number
      OR p.nic_number             IS DISTINCT FROM NEW.nic_number
      OR p.address                IS DISTINCT FROM NEW.address
      OR p.password_created_at      IS DISTINCT FROM NEW.password_created_at
      OR p.temp_password_expires_at IS DISTINCT FROM NEW.temp_password_expires_at
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_contact_after_insert_sync_trg ON public.profiles_contact;
CREATE TRIGGER profiles_contact_after_insert_sync_trg
AFTER INSERT ON public.profiles_contact
FOR EACH ROW
EXECUTE FUNCTION public.profiles_contact_after_write_sync_profile();

DROP TRIGGER IF EXISTS profiles_contact_after_update_sync_trg ON public.profiles_contact;
CREATE TRIGGER profiles_contact_after_update_sync_trg
AFTER UPDATE ON public.profiles_contact
FOR EACH ROW
EXECUTE FUNCTION public.profiles_contact_after_write_sync_profile();

-- ---------------------------------------------------------------------------
-- (2e) Tight RLS on profiles_contact: stricter than profiles.
--      SELECT: self, OR teacher whose lecture group / personal roster contains the student,
--              OR superadmin (handled via SECURITY DEFINER RPCs — no direct policy needed for them).
--      INSERT: self only (auto-trigger from profiles handles the system-driven inserts).
--      UPDATE: self only.
--      DELETE: cascade only (no direct DELETE policy).
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles_contact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_contact_select_own ON public.profiles_contact;
CREATE POLICY profiles_contact_select_own
  ON public.profiles_contact
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_contact_select_lecture_group_teacher ON public.profiles_contact;
CREATE POLICY profiles_contact_select_lecture_group_teacher
  ON public.profiles_contact
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lecture_group_students lgs
      WHERE lgs.student_user_id = profiles_contact.id
        AND public.teacher_can_access_lecture_group(lgs.lecture_group_id)
    )
  );

DROP POLICY IF EXISTS profiles_contact_select_personal_roster_teacher ON public.profiles_contact;
CREATE POLICY profiles_contact_select_personal_roster_teacher
  ON public.profiles_contact
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teacher_personal_roster_entries r
      INNER JOIN public.teacher_personal_groups g ON g.id = r.teacher_personal_group_id
      WHERE r.student_user_id = profiles_contact.id
        AND g.teacher_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS profiles_contact_insert_own ON public.profiles_contact;
CREATE POLICY profiles_contact_insert_own
  ON public.profiles_contact
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_contact_update_own ON public.profiles_contact;
CREATE POLICY profiles_contact_update_own
  ON public.profiles_contact
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE ON public.profiles_contact TO authenticated;
-- Note: no DELETE grant — rows are removed only via the ON DELETE CASCADE from public.profiles.

-- ---------------------------------------------------------------------------
-- (2f) profiles_core: identity-only VIEW on top of profiles
--      security_invoker=true makes underlying profiles RLS apply to the view consumer.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.profiles_core;
CREATE VIEW public.profiles_core
WITH (security_invoker = true) AS
SELECT
  id,
  role,
  full_name,
  first_name,
  last_name
FROM public.profiles;

COMMENT ON VIEW public.profiles_core IS
  'Identity-only projection of public.profiles (id, role, names). RLS inherited from profiles via security_invoker.';

GRANT SELECT ON public.profiles_core TO authenticated;

-- ---------------------------------------------------------------------------
-- (3) FK relationship audit (no schema change here — documenting verification)
--
--     All application-relevant FKs verified to point at the correct parent with appropriate
--     ON DELETE behavior (verified manually against the active migrations):
--
--       lecture_groups.institute_id                  → institutes.id              CASCADE
--       lecture_groups.primary_teacher_user_id       → profiles.id                RESTRICT
--       lecture_group_teachers.lecture_group_id      → lecture_groups.id          CASCADE
--       lecture_group_teachers.teacher_user_id       → profiles.id                CASCADE
--       lecture_group_students.lecture_group_id      → lecture_groups.id          CASCADE
--       lecture_group_students.student_user_id       → profiles.id                CASCADE
--       teacher_personal_groups.teacher_user_id      → profiles.id                CASCADE
--       teacher_personal_roster_entries.teacher_personal_group_id → teacher_personal_groups.id  CASCADE
--       teacher_personal_roster_entries.student_user_id → profiles.id             CASCADE
--       group_attendance_sessions.lecture_group_id   → lecture_groups.id          CASCADE
--       group_attendance_sessions.teacher_personal_group_id → teacher_personal_groups.id  CASCADE
--       group_attendance_sessions.created_by_user_id → profiles.id                SET NULL
--       group_attendance_marks.session_id            → group_attendance_sessions.id  CASCADE
--       group_attendance_marks.student_user_id       → profiles.id                CASCADE
--       group_attendance_marks.personal_roster_id    → teacher_personal_roster_entries.id  CASCADE
--       group_payment_records.lecture_group_id       → lecture_groups.id          CASCADE
--       group_payment_records.teacher_personal_group_id → teacher_personal_groups.id  CASCADE
--       group_payment_records.student_user_id        → profiles.id                CASCADE
--       group_payment_records.personal_roster_id     → teacher_personal_roster_entries.id  CASCADE
--       profiles_contact.id                          → profiles.id                CASCADE  (new)
-- ---------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
