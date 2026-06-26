-- Fix one-time schedule_year default bleed, enforce non-overlapping slots per group.

-- One-time rows must never carry schedule_year (column default was leaking in direct inserts).
UPDATE public.group_schedules
SET schedule_year = NULL
WHERE kind = 'one_time'::public.group_schedule_kind
  AND schedule_year IS NOT NULL;

ALTER TABLE public.group_schedules
  ALTER COLUMN schedule_year DROP DEFAULT;

COMMENT ON COLUMN public.group_schedules.schedule_year IS
  'Calendar year for recurring_weekly only (set explicitly on insert). NULL for one_time.';

CREATE OR REPLACE FUNCTION public.group_schedules_same_group(
  a_lecture uuid,
  a_personal uuid,
  b_lecture uuid,
  b_personal uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    a_lecture IS NOT NULL
    AND b_lecture IS NOT NULL
    AND a_lecture = b_lecture
  ) OR (
    a_personal IS NOT NULL
    AND b_personal IS NOT NULL
    AND a_personal = b_personal
  );
$$;

CREATE OR REPLACE FUNCTION public.group_schedules_times_overlap(
  a_start time,
  a_end time,
  b_start time,
  b_end time
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a_start < b_end AND a_end > b_start;
$$;

CREATE OR REPLACE FUNCTION public.group_schedules_assert_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_id uuid;
BEGIN
  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'schedule_end_before_start';
  END IF;

  IF NEW.kind = 'one_time'::public.group_schedule_kind THEN
    NEW.schedule_year := NULL;
    NEW.day_of_week := NULL;

    IF NEW.class_date IS NULL THEN
      RAISE EXCEPTION 'class_date_required';
    END IF;

    SELECT gs.id INTO v_conflict_id
    FROM public.group_schedules gs
    WHERE gs.id IS DISTINCT FROM NEW.id
      AND public.group_schedules_same_group(
        NEW.lecture_group_id,
        NEW.teacher_personal_group_id,
        gs.lecture_group_id,
        gs.teacher_personal_group_id
      )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND gs.class_date = NEW.class_date
      AND public.group_schedules_times_overlap(gs.start_time, gs.end_time, NEW.start_time, NEW.end_time)
    LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_time_conflict';
    END IF;

    SELECT gs.id INTO v_conflict_id
    FROM public.group_schedules gs
    WHERE gs.id IS DISTINCT FROM NEW.id
      AND public.group_schedules_same_group(
        NEW.lecture_group_id,
        NEW.teacher_personal_group_id,
        gs.lecture_group_id,
        gs.teacher_personal_group_id
      )
      AND gs.kind = 'recurring_weekly'::public.group_schedule_kind
      AND gs.schedule_year = EXTRACT(YEAR FROM NEW.class_date)::int
      AND gs.day_of_week = EXTRACT(DOW FROM NEW.class_date)::int
      AND public.group_schedules_times_overlap(gs.start_time, gs.end_time, NEW.start_time, NEW.end_time)
    LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_time_conflict';
    END IF;

  ELSIF NEW.kind = 'recurring_weekly'::public.group_schedule_kind THEN
    NEW.class_date := NULL;

    IF NEW.day_of_week IS NULL OR NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
      RAISE EXCEPTION 'invalid_day_of_week';
    END IF;

    IF NEW.schedule_year IS NULL THEN
      NEW.schedule_year := EXTRACT(YEAR FROM CURRENT_DATE)::smallint;
    END IF;

    SELECT gs.id INTO v_conflict_id
    FROM public.group_schedules gs
    WHERE gs.id IS DISTINCT FROM NEW.id
      AND public.group_schedules_same_group(
        NEW.lecture_group_id,
        NEW.teacher_personal_group_id,
        gs.lecture_group_id,
        gs.teacher_personal_group_id
      )
      AND gs.kind = 'recurring_weekly'::public.group_schedule_kind
      AND gs.schedule_year = NEW.schedule_year
      AND gs.day_of_week = NEW.day_of_week
      AND public.group_schedules_times_overlap(gs.start_time, gs.end_time, NEW.start_time, NEW.end_time)
    LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_time_conflict';
    END IF;

    SELECT gs.id INTO v_conflict_id
    FROM public.group_schedules gs
    WHERE gs.id IS DISTINCT FROM NEW.id
      AND public.group_schedules_same_group(
        NEW.lecture_group_id,
        NEW.teacher_personal_group_id,
        gs.lecture_group_id,
        gs.teacher_personal_group_id
      )
      AND gs.kind = 'one_time'::public.group_schedule_kind
      AND EXTRACT(YEAR FROM gs.class_date)::int = NEW.schedule_year
      AND EXTRACT(DOW FROM gs.class_date)::int = NEW.day_of_week
      AND public.group_schedules_times_overlap(gs.start_time, gs.end_time, NEW.start_time, NEW.end_time)
    LIMIT 1;

    IF v_conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_time_conflict';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_schedules_no_overlap_trg ON public.group_schedules;

CREATE TRIGGER group_schedules_no_overlap_trg
  BEFORE INSERT OR UPDATE OF
    kind,
    lecture_group_id,
    teacher_personal_group_id,
    day_of_week,
    class_date,
    start_time,
    end_time,
    schedule_year
  ON public.group_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.group_schedules_assert_no_overlap();

CREATE INDEX IF NOT EXISTS group_schedules_weekly_slot_idx
  ON public.group_schedules (
    COALESCE(lecture_group_id, teacher_personal_group_id),
    schedule_year,
    day_of_week,
    start_time,
    end_time
  )
  WHERE kind = 'recurring_weekly'::public.group_schedule_kind;

CREATE INDEX IF NOT EXISTS group_schedules_one_time_slot_idx
  ON public.group_schedules (
    COALESCE(lecture_group_id, teacher_personal_group_id),
    class_date,
    start_time,
    end_time
  )
  WHERE kind = 'one_time'::public.group_schedule_kind;

NOTIFY pgrst, 'reload schema';
