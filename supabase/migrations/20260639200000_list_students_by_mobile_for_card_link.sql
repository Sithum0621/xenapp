-- List all parent_student accounts that share a mobile (shared-phone students).
-- Used when linking a class card so the teacher can pick the correct name.

CREATE OR REPLACE FUNCTION public.list_parent_students_by_mobile(p_mobile text)
RETURNS TABLE (
  student_user_id uuid,
  full_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH want AS (
    SELECT regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g') AS digits
  ),
  want9 AS (
    SELECT
      CASE
        WHEN digits LIKE '0094%' THEN substr(digits, 5)
        WHEN digits LIKE '94%' THEN substr(digits, 3)
        WHEN digits LIKE '0%' THEN substr(digits, 2)
        ELSE digits
      END AS local
    FROM want
  )
  SELECT
    pc.id AS student_user_id,
    COALESCE(
      NULLIF(trim(p.full_name), ''),
      NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Student'
    )::text AS full_name,
    pc.created_at
  FROM public.profiles_contact pc
  INNER JOIN public.profiles p ON p.id = pc.id
  CROSS JOIN want9 w
  WHERE p.role = 'parent_student'::public.profile_role_v2
    AND length(w.local) = 9
    AND w.local LIKE '7%'
    AND right(regexp_replace(coalesce(pc.mobile_number, ''), '\D', '', 'g'), 9) = w.local
  ORDER BY pc.created_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.list_parent_students_by_mobile(text) IS
  'All parent_student profiles that share a Sri Lanka mobile (newest first). Service role only.';

REVOKE ALL ON FUNCTION public.list_parent_students_by_mobile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_parent_students_by_mobile(text) TO service_role;

-- Prefer newest account when a single id is required (legacy callers).
CREATE OR REPLACE FUNCTION public.lookup_parent_student_id_by_mobile(p_mobile text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.student_user_id
  FROM public.list_parent_students_by_mobile(p_mobile) s
  LIMIT 1;
$$;

NOTIFY pgrst, 'reload schema';
