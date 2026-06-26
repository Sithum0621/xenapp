-- Fix infinite RLS recursion on profiles: policies such as profiles_select_roster_student_for_teacher
-- call teacher_can_access_lecture_group(), which queried profiles under SECURITY INVOKER, re-entering
-- profiles RLS and causing PostgREST 500 on profile reads and nested embeds (e.g. lecture_group_students → profiles).

CREATE OR REPLACE FUNCTION public.teacher_can_access_lecture_group(p_lecture_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  )
  AND EXISTS (
    SELECT 1
    FROM public.lecture_groups lg
    WHERE lg.id = p_lecture_group_id
      AND (
        lg.primary_teacher_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.lecture_group_teachers t
          WHERE t.lecture_group_id = lg.id
            AND t.teacher_user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_owns_personal_group(p_personal_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_personal_groups g
    INNER JOIN public.profiles p ON p.id = auth.uid()
    WHERE g.id = p_personal_group_id
      AND g.teacher_user_id = auth.uid()
      AND p.role = 'teacher'::public.profile_role_v2
  );
$$;

REVOKE ALL ON FUNCTION public.teacher_can_access_lecture_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_lecture_group(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.teacher_owns_personal_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_owns_personal_group(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
