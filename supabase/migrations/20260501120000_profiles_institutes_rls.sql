-- Wovello Education: institutes (minimal) + profiles + RLS

CREATE TABLE IF NOT EXISTS public.institutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Untitled institute',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.institutes IS 'Wovello Education: schools/organisations referenced by profiles.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_role') THEN
    CREATE TYPE public.profile_role AS ENUM (
      'superadmin',
      'admin',
      'teacher',
      'parent',
      'parent_student'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  role public.profile_role NOT NULL DEFAULT 'parent_student',
  institute_id uuid REFERENCES public.institutes (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Wovello Education: app profile linked 1:1 to auth.users.';

-- Table may already exist on remote without institute_id; CREATE TABLE IF NOT EXISTS skips DDL.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_institute_id_idx ON public.profiles (institute_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

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
GRANT SELECT ON public.institutes TO authenticated;
