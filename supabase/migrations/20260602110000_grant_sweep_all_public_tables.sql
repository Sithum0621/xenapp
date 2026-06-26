-- Defensive sweep across every table in `public` so the May 2026 explicit-grants model is
-- correctly applied no matter when the table was created. RLS still gates row-level access;
-- this migration only normalizes TABLE-LEVEL GRANTs.
--
-- Important: we do NOT grant INSERT/UPDATE/DELETE to `anon`. `anon` represents any
-- unauthenticated request (publishable key or no key). If a single RLS policy is wrong,
-- granting writes to anon would let the public modify rows directly. This app requires
-- a signed-in user for every screen, so anon gets zero table grants.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    -- Always-on: enable RLS so policies are the only thing that lets writes through.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.table_name);

    -- Full CRUD to authenticated; RLS gates per-row access.
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      tbl.table_name
    );
  END LOOP;
END$$;

-- Sequences (used by SERIAL / IDENTITY columns when authenticated does INSERTs).
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Existing public functions / RPCs callable by signed-in users; SECURITY DEFINER helpers
-- still enforce their own checks.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Default privileges so anything created by the migration role in the future is usable
-- immediately. RLS still gates row-level visibility.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Sanity audit: log any public tables that have RLS enabled but no policies (informational).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policy p
        WHERE p.polrelid = c.oid
      )
  LOOP
    RAISE NOTICE 'public.% has RLS enabled but no policies — every read/write is denied.', r.table_name;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
