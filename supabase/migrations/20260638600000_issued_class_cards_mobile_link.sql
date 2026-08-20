-- Teacher-issued class cards (mtc1_ tokens) claimed by student mobile number.

CREATE TABLE IF NOT EXISTS public.issued_class_cards (
  token            text PRIMARY KEY,
  teacher_user_id  uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  student_user_id  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  CONSTRAINT issued_class_cards_token_fmt CHECK (token ~ '^mtc1_[A-Za-z0-9]{20}$')
);

CREATE INDEX IF NOT EXISTS issued_class_cards_teacher_idx
  ON public.issued_class_cards (teacher_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS issued_class_cards_student_idx
  ON public.issued_class_cards (student_user_id)
  WHERE student_user_id IS NOT NULL;

COMMENT ON TABLE public.issued_class_cards IS
  'Physical class-card QR tokens minted by teachers. student_user_id is set when the teacher links the card via the student mobile number.';

ALTER TABLE public.issued_class_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS issued_class_cards_teacher_insert ON public.issued_class_cards;
CREATE POLICY issued_class_cards_teacher_insert
  ON public.issued_class_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS issued_class_cards_teacher_select ON public.issued_class_cards;
CREATE POLICY issued_class_cards_teacher_select
  ON public.issued_class_cards
  FOR SELECT
  TO authenticated
  USING (teacher_user_id = auth.uid());

-- Find a parent_student by Sri Lanka mobile (any stored format).
CREATE OR REPLACE FUNCTION public.lookup_parent_student_id_by_mobile(p_mobile text)
RETURNS uuid
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
  SELECT pc.id
  FROM public.profiles_contact pc
  INNER JOIN public.profiles p ON p.id = pc.id
  CROSS JOIN want9 w
  WHERE p.role = 'parent_student'::public.profile_role_v2
    AND length(w.local) = 9
    AND w.local LIKE '7%'
    AND right(regexp_replace(coalesce(pc.mobile_number, ''), '\D', '', 'g'), 9) = w.local
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_parent_student_id_by_mobile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_parent_student_id_by_mobile(text) TO service_role;

-- Parent/teacher lookup of a claimed issued card (no teacher UUID in the QR).
CREATE OR REPLACE FUNCTION public.lookup_issued_class_card(p_token text)
RETURNS TABLE (
  student_user_id uuid,
  teacher_user_id uuid,
  claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.student_user_id,
    c.teacher_user_id,
    (c.student_user_id IS NOT NULL) AS claimed
  FROM public.issued_class_cards c
  WHERE c.token = trim(p_token)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_issued_class_card(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_issued_class_card(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
