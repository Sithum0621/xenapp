-- Public APK hosting for in-app Android updates (online download only).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-releases',
  'app-releases',
  true,
  104857600,
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS app_releases_select_public ON storage.objects;
CREATE POLICY app_releases_select_public
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'app-releases');

DROP POLICY IF EXISTS app_releases_insert_superadmin ON storage.objects;
CREATE POLICY app_releases_insert_superadmin
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'app-releases'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS app_releases_update_superadmin ON storage.objects;
CREATE POLICY app_releases_update_superadmin
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'app-releases'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS app_releases_delete_superadmin ON storage.objects;
CREATE POLICY app_releases_delete_superadmin
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'app-releases'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

CREATE OR REPLACE FUNCTION public.publish_android_app_release(
  p_version_name text,
  p_version_code integer,
  p_download_url text,
  p_release_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_superadmin';
  END IF;

  IF p_version_code IS NULL OR p_version_code <= 0 THEN
    RAISE EXCEPTION 'invalid_version_code';
  END IF;

  IF p_download_url IS NULL OR length(trim(p_download_url)) = 0 OR trim(p_download_url) !~* '^https://' THEN
    RAISE EXCEPTION 'invalid_download_url';
  END IF;

  IF p_version_name IS NULL OR length(trim(p_version_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_version_name';
  END IF;

  UPDATE public.app_android_releases
  SET is_current = false
  WHERE is_current = true;

  INSERT INTO public.app_android_releases (
    version_name,
    version_code,
    download_url,
    release_notes,
    is_current
  )
  VALUES (
    trim(p_version_name),
    p_version_code,
    trim(p_download_url),
    COALESCE(trim(p_release_notes), ''),
    true
  );

  RETURN public.get_current_android_app_release();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_android_app_release(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_android_app_release(text, integer, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
