-- Personal groups: physical vs online delivery for teacher-created classes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_delivery_mode') THEN
    CREATE TYPE public.class_delivery_mode AS ENUM ('physical', 'online');
  END IF;
END$$;

ALTER TABLE public.teacher_personal_groups
  ADD COLUMN IF NOT EXISTS delivery_mode public.class_delivery_mode NOT NULL DEFAULT 'physical';

COMMENT ON COLUMN public.teacher_personal_groups.delivery_mode IS
  'Whether this personal group meets physically or online.';

NOTIFY pgrst, 'reload schema';
