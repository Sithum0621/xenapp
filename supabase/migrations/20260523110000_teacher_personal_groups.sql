-- Teacher-owned groups (not tied to an institute roster). Listed alongside institute lecture groups.

CREATE TABLE IF NOT EXISTS public.teacher_personal_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_personal_groups_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS teacher_personal_groups_teacher_idx
  ON public.teacher_personal_groups (teacher_user_id);

COMMENT ON TABLE public.teacher_personal_groups IS
  'Teacher-managed groups independent of institute lecture_groups; editable only by owning teacher profile.';

ALTER TABLE public.teacher_personal_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_personal_groups_select_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_select_own"
  ON public.teacher_personal_groups
  FOR SELECT
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS "teacher_personal_groups_insert_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_insert_own"
  ON public.teacher_personal_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS "teacher_personal_groups_update_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_update_own"
  ON public.teacher_personal_groups
  FOR UPDATE
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  )
  WITH CHECK (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS "teacher_personal_groups_delete_own" ON public.teacher_personal_groups;
CREATE POLICY "teacher_personal_groups_delete_own"
  ON public.teacher_personal_groups
  FOR DELETE
  TO authenticated
  USING (
    teacher_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'teacher'::public.profile_role_v2
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_personal_groups TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_personal_groups_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_personal_groups_updated_at ON public.teacher_personal_groups;
CREATE TRIGGER teacher_personal_groups_updated_at
BEFORE UPDATE ON public.teacher_personal_groups
FOR EACH ROW
EXECUTE FUNCTION public.teacher_personal_groups_set_updated_at();

NOTIFY pgrst, 'reload schema';
