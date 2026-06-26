-- Exactly one primary teacher per lecture group; co-teachers optional via lecture_group_teachers.

ALTER TABLE public.lecture_groups
  ADD COLUMN IF NOT EXISTS primary_teacher_user_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.lecture_groups.primary_teacher_user_id IS
  'Required primary teacher for the group; must belong to the institute roster. Co-teachers may be added via lecture_group_teachers.';

-- Backfill from existing junction rows (first assigned teacher per group).
UPDATE public.lecture_groups g
SET primary_teacher_user_id = sub.tid
FROM (
  SELECT DISTINCT ON (gt.lecture_group_id)
    gt.lecture_group_id AS gid,
    gt.teacher_user_id AS tid
  FROM public.lecture_group_teachers gt
  ORDER BY gt.lecture_group_id, gt.created_at
) sub
WHERE g.id = sub.gid
  AND g.primary_teacher_user_id IS NULL;

-- Remove groups that still have no primary (cannot satisfy new rule).
DELETE FROM public.lecture_groups
WHERE primary_teacher_user_id IS NULL;

ALTER TABLE public.lecture_groups
  ALTER COLUMN primary_teacher_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS lecture_groups_primary_teacher_idx
  ON public.lecture_groups (primary_teacher_user_id);

COMMENT ON TABLE public.lecture_groups IS
  'Lecture groups per institute; exactly one primary_teacher_user_id; multiple students per group to be modeled in future enrollment tables.';

-- CREATE OR REPLACE cannot change RETURNS TABLE column list; drop and recreate.
DROP FUNCTION IF EXISTS public.institute_admin_list_lecture_groups(jsonb);
DROP FUNCTION IF EXISTS public.institute_admin_list_teacher_lecture_groups(uuid);

CREATE OR REPLACE FUNCTION public.institute_admin_list_lecture_groups(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  primary_teacher_user_id uuid,
  primary_teacher_full_name text
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
    g.created_at,
    g.primary_teacher_user_id,
    COALESCE(pt.full_name, '')::text
  FROM public.lecture_groups g
  INNER JOIN public.profiles pt ON pt.id = g.primary_teacher_user_id
  WHERE g.institute_id = v_inst
    AND (
      length(v_search) = 0
      OR g.name ILIKE '%' || v_search || '%'
      OR COALESCE(g.description, '') ILIKE '%' || v_search || '%'
      OR pt.full_name ILIKE '%' || v_search || '%'
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
  v_primary uuid;
  v_id uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  v_desc := NULLIF(trim(coalesce(p_payload->>'description', '')), '');

  BEGIN
    v_primary := trim(coalesce(p_payload->>'primary_teacher_user_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_primary_teacher_id';
  END;

  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'primary_teacher_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.institute_teacher_membership m
    WHERE m.institute_id = v_inst
      AND m.user_id = v_primary
  ) THEN
    RAISE EXCEPTION 'teacher_not_in_institute';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_primary AND role = 'teacher'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_teacher';
  END IF;

  INSERT INTO public.lecture_groups (institute_id, name, description, primary_teacher_user_id)
  VALUES (v_inst, v_name, v_desc, v_primary)
  RETURNING lecture_groups.id INTO v_id;

  INSERT INTO public.lecture_group_teachers (lecture_group_id, teacher_user_id)
  VALUES (v_id, v_primary)
  ON CONFLICT (lecture_group_id, teacher_user_id) DO NOTHING;

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
  created_at timestamptz,
  is_primary boolean
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
    g.created_at,
    (g.primary_teacher_user_id = p_teacher_user_id)
  FROM public.lecture_group_teachers gt
  INNER JOIN public.lecture_groups g ON g.id = gt.lecture_group_id
  WHERE gt.teacher_user_id = p_teacher_user_id
    AND g.institute_id = v_inst
  ORDER BY lower(g.name);
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_teacher_lecture_groups(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_teacher_lecture_groups(uuid) TO authenticated;

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

  IF EXISTS (
    SELECT 1
    FROM public.lecture_groups g
    WHERE g.id = v_group
      AND g.institute_id = v_inst
      AND g.primary_teacher_user_id = v_teacher
  ) THEN
    RAISE EXCEPTION 'cannot_remove_primary_teacher';
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
