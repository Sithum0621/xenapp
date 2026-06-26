-- Public Android APK release metadata for in-app update checks.

CREATE TABLE IF NOT EXISTS public.app_android_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL,
  version_code integer NOT NULL,
  download_url text NOT NULL,
  release_notes text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_android_releases_version_code_positive CHECK (version_code > 0),
  CONSTRAINT app_android_releases_download_url_https CHECK (download_url ~* '^https://')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_android_releases_one_current_idx
  ON public.app_android_releases ((true))
  WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS app_android_releases_version_code_unique
  ON public.app_android_releases (version_code);

COMMENT ON TABLE public.app_android_releases IS
  'Latest Android APK download metadata exposed to the mobile app for manual updates.';

ALTER TABLE public.app_android_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_android_releases_read_all ON public.app_android_releases;
CREATE POLICY app_android_releases_read_all
  ON public.app_android_releases
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.app_android_releases FROM PUBLIC;
GRANT SELECT ON TABLE public.app_android_releases TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_current_android_app_release()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version_name', r.version_name,
    'version_code', r.version_code,
    'download_url', r.download_url,
    'release_notes', COALESCE(r.release_notes, '')
  )
  FROM public.app_android_releases r
  WHERE r.is_current = true
  ORDER BY r.version_code DESC, r.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_android_app_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_android_app_release() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
