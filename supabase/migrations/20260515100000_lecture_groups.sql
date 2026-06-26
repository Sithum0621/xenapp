-- Lecture groups per institute; teacher ↔ group assignments scoped to institute admin RPCs.

CREATE TABLE IF NOT EXISTS public.lecture_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES public.institutes (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lecture_groups_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS lecture_groups_institute_id_idx ON public.lecture_groups (institute_id);

CREATE TABLE IF NOT EXISTS public.lecture_group_teachers (
  lecture_group_id uuid NOT NULL REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lecture_group_id, teacher_user_id)
);

CREATE INDEX IF NOT EXISTS lecture_group_teachers_teacher_idx ON public.lecture_group_teachers (teacher_user_id);

COMMENT ON TABLE public.lecture_groups IS 'Lecture groups owned by an institute; accessed via institute_admin_* RPCs only.';
COMMENT ON TABLE public.lecture_group_teachers IS 'Teachers assigned to lecture groups within the same institute.';

ALTER TABLE public.lecture_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_group_teachers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.institute_admin_list_lecture_groups(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_search text;
  v_limit int := 10;
  v_offset int := 0;
BEGIN
  v_inst := public.institute_admin_require_institute();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 10), 1), 200);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 10;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  RETURN QUERY
  SELECT
    g.id,
    g.name::text,
    g.description::text,
    g.created_at
  FROM public.lecture_groups g
  WHERE g.institute_id = v_inst
    AND (
      length(v_search) = 0
      OR g.name ILIKE '%' || v_search || '%'
      OR COALESCE(g.description, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY lower(g.name)
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_lecture_groups(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_lecture_groups(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_create_lecture_group(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_name text;
  v_desc text;
  v_id uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  v_desc := NULLIF(trim(coalesce(p_payload->>'description', '')), '');

  INSERT INTO public.lecture_groups (institute_id, name, description)
  VALUES (v_inst, v_name, v_desc)
  RETURNING lecture_groups.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_create_lecture_group(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_create_lecture_group(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_list_teacher_lecture_groups(p_teacher_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  IF NOT EXISTS (
    SELECT 1
    FROM public.institute_teacher_membership m
    WHERE m.institute_id = v_inst
      AND m.user_id = p_teacher_user_id
  ) THEN
    RAISE EXCEPTION 'teacher_not_in_institute';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.name::text,
    g.description::text,
    g.created_at
  FROM public.lecture_group_teachers gt
  INNER JOIN public.lecture_groups g ON g.id = gt.lecture_group_id
  WHERE gt.teacher_user_id = p_teacher_user_id
    AND g.institute_id = v_inst
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_teacher_lecture_groups(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_teacher_lecture_groups(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_get_teacher_profile(p_teacher_user_id uuid)
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
  v_inst uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  IF NOT EXISTS (
    SELECT 1
    FROM public.institute_teacher_membership m
    WHERE m.institute_id = v_inst
      AND m.user_id = p_teacher_user_id
  ) THEN
    RAISE EXCEPTION 'teacher_not_in_institute';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_teacher_user_id
      AND p.role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(p.full_name, '')::text
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_teacher_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_get_teacher_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_get_teacher_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_link_teacher_to_lecture_group(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_group uuid;
  v_teacher uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  BEGIN
    v_group := trim(coalesce(p_payload->>'lecture_group_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_lecture_group_id';
  END;

  BEGIN
    v_teacher := trim(coalesce(p_payload->>'teacher_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_teacher_id';
  END;

  IF v_group IS NULL OR v_teacher IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lecture_groups WHERE id = v_group AND institute_id = v_inst
  ) THEN
    RAISE EXCEPTION 'lecture_group_not_in_institute';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.institute_teacher_membership m
    WHERE m.institute_id = v_inst AND m.user_id = v_teacher
  ) THEN
    RAISE EXCEPTION 'teacher_not_in_institute';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_teacher AND role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  INSERT INTO public.lecture_group_teachers (lecture_group_id, teacher_user_id)
  VALUES (v_group, v_teacher)
  ON CONFLICT (lecture_group_id, teacher_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_link_teacher_to_lecture_group(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_link_teacher_to_lecture_group(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_unlink_teacher_from_lecture_group(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_group uuid;
  v_teacher uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  BEGIN
    v_group := trim(coalesce(p_payload->>'lecture_group_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_lecture_group_id';
  END;

  BEGIN
    v_teacher := trim(coalesce(p_payload->>'teacher_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_teacher_id';
  END;

  IF v_group IS NULL OR v_teacher IS NULL THEN
    RAISE EXCEPTION 'payload_incomplete';
  END IF;

  DELETE FROM public.lecture_group_teachers gt
  USING public.lecture_groups g
  WHERE gt.lecture_group_id = v_group
    AND gt.teacher_user_id = v_teacher
    AND g.id = gt.lecture_group_id
    AND g.institute_id = v_inst;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_unlink_teacher_from_lecture_group(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_unlink_teacher_from_lecture_group(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
