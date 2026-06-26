-- Align profiles role model with Wovello Education public flow:
-- superadmin, admin, teacher, parent_student

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'profile_role_v2'
  ) THEN
    CREATE TYPE public.profile_role_v2 AS ENUM (
      'superadmin',
      'admin',
      'teacher',
      'parent_student'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  role public.profile_role_v2 NOT NULL DEFAULT 'parent_student'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN role DROP DEFAULT;

    ALTER TABLE public.profiles
      ALTER COLUMN role TYPE text USING role::text;

    UPDATE public.profiles
    SET role = 'parent_student'
    WHERE role NOT IN ('superadmin', 'admin', 'teacher', 'parent_student');

    ALTER TABLE public.profiles
      ALTER COLUMN role TYPE public.profile_role_v2
      USING role::public.profile_role_v2;

    ALTER TABLE public.profiles
      ALTER COLUMN role SET DEFAULT 'parent_student';
  END IF;
END$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS institute_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS created_at;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
