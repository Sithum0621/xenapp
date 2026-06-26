-- Teacher-invited students: optional NIC; personal roster links to auth profiles; profile read for linked students.

-- ---------------------------------------------------------------------------
-- Teacher-invited flag lives on auth.users.raw_user_meta_data.teacher_invited
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profile_auth_teacher_invited(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((u.raw_user_meta_data->>'teacher_invited') = 'true', false)
  FROM auth.users u
  WHERE u.id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.profile_auth_teacher_invited(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_auth_teacher_invited(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Relax NIC rules for teacher-invited accounts (metadata set at Auth signup)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_validate_nic_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  IF NEW.nic_number IS NULL OR length(trim(NEW.nic_number)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id)
       AND NOT public.profile_auth_teacher_invited(NEW.id) THEN
      RAISE EXCEPTION 'nic_required' USING ERRCODE = '23502';
    END IF;
    NEW.nic_number := NULL;
    RETURN NEW;
  END IF;

  n := public.normalize_profile_nic(NEW.nic_number);

  IF NOT (
    (length(n) = 12 AND n ~ '^[0-9]{12}$')
    OR (length(n) = 10 AND n ~ '^[0-9]{9}[VX]$')
  ) THEN
    RAISE EXCEPTION 'invalid_nic_format' USING ERRCODE = 'check_violation';
  END IF;

  NEW.nic_number := n;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_nic_required;

-- Existing DBs may contain profiles with NULL/empty NIC (tests, legacy rows). Those rows fail the new
-- CHECK until they are teacher-invited or superadmin-exempt. Assign reserved synthetic 12-digit NICs
-- (910…) so the constraint can be applied; admins can replace with real NICs later.
WITH missing AS (
  SELECT
    p.id,
    row_number() OVER (ORDER BY p.id) AS rn
  FROM public.profiles p
  WHERE (p.nic_number IS NULL OR length(trim(p.nic_number)) = 0)
    AND NOT public.auth_user_email_matches_designated_superadmin(p.id)
    AND NOT public.profile_auth_teacher_invited(p.id)
),
max_synth AS (
  SELECT COALESCE(
    MAX(
      CASE
        WHEN nic_number ~ '^910[0-9]{9}$' AND length(trim(nic_number)) = 12
        THEN trim(nic_number)::bigint
      END
    ),
    910000000000::bigint
  ) AS base_nic
  FROM public.profiles
),
numbered AS (
  SELECT m.id, (ms.base_nic + m.rn)::text AS synth
  FROM missing m
  CROSS JOIN max_synth ms
)
UPDATE public.profiles p
SET nic_number = n.synth
FROM numbered n
WHERE p.id = n.id;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nic_required CHECK (
    (nic_number IS NOT NULL AND length(trim(nic_number)) > 0)
    OR public.auth_user_email_matches_designated_superadmin(id)
    OR public.profile_auth_teacher_invited(id)
  );

CREATE OR REPLACE FUNCTION public.handle_auth_user_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  v_role public.profile_role_v2;
  v_full_name text;
  v_nic text;
  v_trial_end timestamptz;
  v_teacher_invited boolean;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  v_full_name := NULLIF(trim(COALESCE(meta->>'full_name', '')), '');

  IF meta ? 'role' AND length(trim(COALESCE(meta->>'role', ''))) > 0 THEN
    BEGIN
      v_role := trim(meta->>'role')::public.profile_role_v2;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_role := 'parent_student'::public.profile_role_v2;
    END;
  ELSE
    v_role := 'parent_student'::public.profile_role_v2;
  END IF;

  v_teacher_invited := COALESCE(meta->>'teacher_invited', '') = 'true';

  v_nic := NULLIF(trim(COALESCE(meta->>'nic_number', '')), '');
  IF v_nic IS NOT NULL THEN
    v_nic := public.normalize_profile_nic(v_nic);
  END IF;

  IF v_nic IS NULL OR length(trim(v_nic)) = 0 THEN
    IF NOT public.auth_user_email_matches_designated_superadmin(NEW.id) AND NOT v_teacher_invited THEN
      RAISE EXCEPTION 'nic_required_for_registration' USING ERRCODE = '23502';
    END IF;
  END IF;

  v_trial_end := now() + interval '30 days';

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    trial_ends_at,
    subscription_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_trial_end,
    'trial'
  );

  INSERT INTO public.subscriptions (
    user_id,
    device_id,
    expiry_date,
    is_active,
    updated_at
  )
  VALUES (
    NEW.id,
    'nic-bound',
    v_trial_end,
    true,
    now()
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Personal roster: optional link to registered student (Wovello profile)
-- ---------------------------------------------------------------------------

ALTER TABLE public.teacher_personal_roster_entries
  ADD COLUMN IF NOT EXISTS student_user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.teacher_personal_roster_entries
  DROP CONSTRAINT IF EXISTS teacher_personal_roster_display_nonempty;

ALTER TABLE public.teacher_personal_roster_entries
  DROP CONSTRAINT IF EXISTS teacher_personal_roster_student_or_name;

ALTER TABLE public.teacher_personal_roster_entries
  ADD CONSTRAINT teacher_personal_roster_student_or_name CHECK (
    (student_user_id IS NOT NULL)
    OR (length(trim(display_name)) > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS teacher_personal_roster_group_student_unique
  ON public.teacher_personal_roster_entries (teacher_personal_group_id, student_user_id)
  WHERE student_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS teacher_personal_roster_student_idx
  ON public.teacher_personal_roster_entries (student_user_id)
  WHERE student_user_id IS NOT NULL;

COMMENT ON COLUMN public.teacher_personal_roster_entries.student_user_id IS
  'When set, this roster row represents a registered Wovello student linked to the personal group.';

-- Teachers may read names of students linked on their personal rosters (for joins / future use).
DROP POLICY IF EXISTS profiles_select_personal_roster_student_for_teacher ON public.profiles;
CREATE POLICY profiles_select_personal_roster_student_for_teacher
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.teacher_personal_roster_entries r
      INNER JOIN public.teacher_personal_groups g ON g.id = r.teacher_personal_group_id
      WHERE r.student_user_id = profiles.id
        AND g.teacher_user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
