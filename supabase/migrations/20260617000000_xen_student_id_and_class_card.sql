-- XEN digital student ID: unique public ID (XEN-YYYY-NNNN) + class card RPC.

CREATE SEQUENCE IF NOT EXISTS public.xen_student_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xen_student_number bigint,
  ADD COLUMN IF NOT EXISTS xen_student_id text,
  ADD COLUMN IF NOT EXISTS xen_student_id_year int;

COMMENT ON COLUMN public.profiles.xen_student_id IS
  'Public XEN student ID: XEN-[registration year]-[sequence], sequence zero-padded to min 4 digits.';
COMMENT ON COLUMN public.profiles.xen_student_number IS
  'Monotonic allocator backing xen_student_id (global sequence).';
COMMENT ON COLUMN public.profiles.xen_student_id_year IS
  'Registration year embedded in xen_student_id (from auth.users.created_at at assignment).';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_xen_student_id_unique
  ON public.profiles (xen_student_id)
  WHERE xen_student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_xen_student_number_unique
  ON public.profiles (xen_student_number)
  WHERE xen_student_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Format: XEN-2026-0001 (min 4-digit pad; 10000+ expands naturally)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.format_xen_student_id(p_year int, p_number bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'XEN-' || p_year::text || '-' ||
    CASE
      WHEN p_number < 10000 THEN lpad(p_number::text, 4, '0')
      ELSE p_number::text
    END;
$$;

-- ---------------------------------------------------------------------------
-- Authorization helper (parent link or self)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parent_may_view_student(p_viewer uuid, p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_viewer = p_student
    OR EXISTS (
      SELECT 1
      FROM public.parent_student_links l
      WHERE l.parent_user_id = p_viewer
        AND l.student_user_id = p_student
    );
$$;

-- ---------------------------------------------------------------------------
-- Allocate xen_student_id on first use (idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_xen_student_id(p_student_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_role     public.profile_role_v2;
  v_existing text;
  v_year     int;
  v_num      bigint;
  v_id       text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT p.xen_student_id, p.role
  INTO v_existing, v_role
  FROM public.profiles p
  WHERE p.id = p_student_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  IF v_role IS DISTINCT FROM 'parent_student'::public.profile_role_v2 THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  IF v_existing IS NOT NULL AND length(trim(v_existing)) > 0 THEN
    RETURN trim(v_existing);
  END IF;

  SELECT EXTRACT(YEAR FROM COALESCE(u.created_at, now()))::int
  INTO v_year
  FROM auth.users u
  WHERE u.id = p_student_user_id;

  IF v_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM now())::int;
  END IF;

  v_num := nextval('public.xen_student_number_seq');
  v_id := public.format_xen_student_id(v_year, v_num);

  UPDATE public.profiles
  SET
    xen_student_number = v_num,
    xen_student_id_year = v_year,
    xen_student_id = v_id
  WHERE id = p_student_user_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Class card payload for the mobile UI
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.student_class_card(p_student_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_role   public.profile_role_v2;
  v_full   text;
  v_mobile text;
  v_xen    text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_xen := public.ensure_xen_student_id(p_student_user_id);

  SELECT
    p.role,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      NULLIF(
        CONCAT_WS(
          ' ',
          NULLIF(trim(p.first_name), ''),
          NULLIF(trim(p.last_name), '')
        ),
        ''
      )
    ),
    pc.mobile_number
  INTO v_role, v_full, v_mobile
  FROM public.profiles p
  LEFT JOIN public.profiles_contact pc ON pc.id = p.id
  WHERE p.id = p_student_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  RETURN jsonb_build_object(
    'student_user_id', p_student_user_id,
    'full_name', COALESCE(v_full, ''),
    'mobile_number', COALESCE(v_mobile, ''),
    'xen_student_id', COALESCE(v_xen, '')
  );
END;
$$;

-- Backfill existing parent_student profiles in registration order
DO $$
DECLARE
  r record;
  v_year int;
  v_num  bigint;
  v_id   text;
BEGIN
  FOR r IN
    SELECT p.id, u.created_at
    FROM public.profiles p
    INNER JOIN auth.users u ON u.id = p.id
    WHERE p.role = 'parent_student'::public.profile_role_v2
      AND (p.xen_student_id IS NULL OR trim(p.xen_student_id) = '')
    ORDER BY u.created_at ASC NULLS LAST, p.id ASC
  LOOP
    v_year := EXTRACT(YEAR FROM COALESCE(r.created_at, now()))::int;
    v_num := nextval('public.xen_student_number_seq');
    v_id := public.format_xen_student_id(v_year, v_num);

    UPDATE public.profiles
    SET
      xen_student_number = v_num,
      xen_student_id_year = v_year,
      xen_student_id = v_id
    WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.format_xen_student_id(int, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parent_may_view_student(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_xen_student_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.student_class_card(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.format_xen_student_id(int, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_xen_student_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_class_card(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
