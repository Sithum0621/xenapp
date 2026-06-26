-- Many-to-many: teachers and students can belong to multiple institutes.
-- Institute admins (profiles.institute_id) remain 1:1 with their institute.
-- All institute-admin RPCs scope by membership only; search never exposes other institutes.

CREATE TABLE IF NOT EXISTS public.institute_teacher_membership (
  institute_id uuid NOT NULL REFERENCES public.institutes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institute_id, user_id)
);

CREATE INDEX IF NOT EXISTS institute_teacher_membership_user_id_idx
  ON public.institute_teacher_membership (user_id);

COMMENT ON TABLE public.institute_teacher_membership IS
  'Teacher ↔ institute roster. Institute admins list/assign via SECURITY DEFINER RPCs only; no cross-institute leakage.';

CREATE TABLE IF NOT EXISTS public.institute_student_membership (
  institute_id uuid NOT NULL REFERENCES public.institutes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institute_id, user_id)
);

CREATE INDEX IF NOT EXISTS institute_student_membership_user_id_idx
  ON public.institute_student_membership (user_id);

COMMENT ON TABLE public.institute_student_membership IS
  'Student ↔ institute roster for per-institute data (e.g. future attendance). Scoped by institute_id in app RPCs.';

ALTER TABLE public.institute_teacher_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_student_membership ENABLE ROW LEVEL SECURITY;

-- No policies: only definer-owned server-side functions access these tables.

COMMENT ON COLUMN public.profiles.institute_id IS
  'For role admin: single home institute (superadmin-provisioned). Teachers and students use institute_teacher_membership / institute_student_membership; this column must be NULL for those roles after backfill.';

-- Backfill memberships from legacy single-institute column (teachers).
INSERT INTO public.institute_teacher_membership (institute_id, user_id)
SELECT p.institute_id, p.id
FROM public.profiles p
WHERE p.role = 'teacher'::public.profile_role_v2
  AND p.institute_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill student memberships if any legacy rows existed.
INSERT INTO public.institute_student_membership (institute_id, user_id)
SELECT p.institute_id, p.id
FROM public.profiles p
WHERE p.role = 'parent_student'::public.profile_role_v2
  AND p.institute_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Stop using profiles.institute_id for teachers and students (M:N is source of truth).
UPDATE public.profiles
SET institute_id = NULL
WHERE role IN ('teacher'::public.profile_role_v2, 'parent_student'::public.profile_role_v2);

CREATE OR REPLACE FUNCTION public.institute_admin_list_teachers(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_search text;
  v_limit int := 100;
  v_offset int := 0;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 100), 1), 200);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 100;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.institute_teacher_membership m
  INNER JOIN public.profiles p ON p.id = m.user_id AND p.role = 'teacher'::public.profile_role_v2
  INNER JOIN auth.users u ON u.id = p.id
  WHERE m.institute_id = v_my_institute
    AND (
      length(v_search) = 0
      OR u.email::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.institute_admin_search_teachers_to_assign(p_query jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_search text;
  v_limit int := 25;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  v_search := trim(coalesce(p_query->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_query->>'limit')::int, 25), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 25;
  END;

  -- Privacy: only id + email + display name. No joins to institutes or other memberships.
  -- Candidates = teachers who are not already on this institute's roster (may belong elsewhere).
  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'teacher'::public.profile_role_v2
    AND NOT EXISTS (
      SELECT 1
      FROM public.institute_teacher_membership m
      WHERE m.institute_id = v_my_institute
        AND m.user_id = p.id
    )
    AND (
      length(v_search) = 0
      OR u.email::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(COALESCE(p.full_name, '')), lower(u.email::text)
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.institute_admin_assign_teacher(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_institute uuid;
  v_teacher uuid;
BEGIN
  v_my_institute := public.institute_admin_require_institute();

  BEGIN
    v_teacher := trim(coalesce(p_payload->>'teacher_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_teacher_id';
  END;

  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_teacher AND role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'cannot_assign_superadmin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_teacher AND role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  INSERT INTO public.institute_teacher_membership (institute_id, user_id)
  VALUES (v_my_institute, v_teacher)
  ON CONFLICT (institute_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_teachers(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_teachers(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.institute_admin_search_teachers_to_assign(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_search_teachers_to_assign(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.institute_admin_assign_teacher(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_assign_teacher(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
