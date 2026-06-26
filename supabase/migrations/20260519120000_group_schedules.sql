-- Recurring weekly and one-time class schedules per lecture group.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'group_schedule_kind') THEN
    CREATE TYPE public.group_schedule_kind AS ENUM ('recurring_weekly', 'one_time');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.group_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_group_id uuid NOT NULL REFERENCES public.lecture_groups (id) ON DELETE CASCADE,
  kind public.group_schedule_kind NOT NULL,
  -- 0 = Sunday .. 6 = Saturday (JavaScript Date.getDay() convention)
  day_of_week smallint,
  class_date date,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_schedules_recurring_ck CHECK (
    (kind = 'recurring_weekly'::public.group_schedule_kind AND day_of_week IS NOT NULL AND class_date IS NULL)
    OR (kind = 'one_time'::public.group_schedule_kind AND class_date IS NOT NULL AND day_of_week IS NULL)
  ),
  CONSTRAINT group_schedules_dow_ck CHECK (
    day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)
  ),
  CONSTRAINT group_schedules_time_ck CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS group_schedules_lecture_group_id_idx
  ON public.group_schedules (lecture_group_id);

CREATE INDEX IF NOT EXISTS group_schedules_one_time_date_idx
  ON public.group_schedules (lecture_group_id, class_date)
  WHERE kind = 'one_time'::public.group_schedule_kind;

COMMENT ON TABLE public.group_schedules IS
  'Class times: recurring_weekly (day_of_week + times) or one_time (class_date + times). Managed via institute_admin_* RPCs only.';

ALTER TABLE public.group_schedules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.institute_admin_list_group_schedules(p_lecture_group_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  day_of_week int,
  class_date date,
  start_time text,
  end_time text,
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
    SELECT 1 FROM public.lecture_groups g
    WHERE g.id = p_lecture_group_id AND g.institute_id = v_inst
  ) THEN
    RAISE EXCEPTION 'lecture_group_not_in_institute';
  END IF;

  RETURN QUERY
  SELECT
    gs.id,
    gs.kind::text,
    gs.day_of_week::int,
    gs.class_date,
    to_char(gs.start_time, 'HH24:MI')::text,
    to_char(gs.end_time, 'HH24:MI')::text,
    gs.created_at
  FROM public.group_schedules gs
  WHERE gs.lecture_group_id = p_lecture_group_id
  ORDER BY
    CASE WHEN gs.kind = 'recurring_weekly'::public.group_schedule_kind THEN 0 ELSE 1 END,
    gs.day_of_week NULLS LAST,
    gs.class_date NULLS LAST,
    gs.start_time;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_list_group_schedules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_list_group_schedules(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_create_group_schedule(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_group uuid;
  v_kind text;
  v_dow int;
  v_date date;
  v_start time;
  v_end time;
  v_id uuid;
BEGIN
  v_inst := public.institute_admin_require_institute();

  BEGIN
    v_group := trim(coalesce(p_payload->>'lecture_group_id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_lecture_group_id';
  END;

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'lecture_group_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lecture_groups g
    WHERE g.id = v_group AND g.institute_id = v_inst
  ) THEN
    RAISE EXCEPTION 'lecture_group_not_in_institute';
  END IF;

  v_kind := lower(trim(coalesce(p_payload->>'kind', '')));
  IF v_kind NOT IN ('recurring_weekly', 'one_time') THEN
    RAISE EXCEPTION 'invalid_schedule_kind';
  END IF;

  BEGIN
    v_start := trim(coalesce(p_payload->>'start_time', ''))::time;
    v_end := trim(coalesce(p_payload->>'end_time', ''))::time;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_time';
  END;

  IF v_start >= v_end THEN
    RAISE EXCEPTION 'end_before_start';
  END IF;

  IF v_kind = 'recurring_weekly' THEN
    BEGIN
      v_dow := (p_payload->>'day_of_week')::int;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_day_of_week';
    END;
    IF v_dow IS NULL OR v_dow < 0 OR v_dow > 6 THEN
      RAISE EXCEPTION 'invalid_day_of_week';
    END IF;

    INSERT INTO public.group_schedules (
      lecture_group_id, kind, day_of_week, class_date, start_time, end_time
    )
    VALUES (
      v_group,
      'recurring_weekly'::public.group_schedule_kind,
      v_dow,
      NULL,
      v_start,
      v_end
    )
    RETURNING group_schedules.id INTO v_id;
  ELSE
    BEGIN
      v_date := trim(coalesce(p_payload->>'class_date', ''))::date;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_class_date';
    END;
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'class_date_required';
    END IF;

    INSERT INTO public.group_schedules (
      lecture_group_id, kind, day_of_week, class_date, start_time, end_time
    )
    VALUES (
      v_group,
      'one_time'::public.group_schedule_kind,
      NULL,
      v_date,
      v_start,
      v_end
    )
    RETURNING group_schedules.id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_create_group_schedule(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_create_group_schedule(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_delete_group_schedule(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst uuid;
  v_id uuid;
  v_deleted int;
BEGIN
  v_inst := public.institute_admin_require_institute();

  BEGIN
    v_id := trim(coalesce(p_payload->>'id', ''))::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_schedule_id';
  END;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'schedule_id_required';
  END IF;

  DELETE FROM public.group_schedules gs
  USING public.lecture_groups g
  WHERE gs.id = v_id
    AND gs.lecture_group_id = g.id
    AND g.institute_id = v_inst;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_admin_delete_group_schedule(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_delete_group_schedule(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
