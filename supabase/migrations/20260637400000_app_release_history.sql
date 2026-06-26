-- Release history for superadmin + notify users about a specific published version.

CREATE OR REPLACE FUNCTION public.superadmin_list_android_app_releases(
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id            uuid,
  version_name  text,
  version_code  integer,
  download_url  text,
  release_notes text,
  is_current    boolean,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lim   int := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_superadmin';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.version_name,
    r.version_code,
    r.download_url,
    COALESCE(r.release_notes, '')::text,
    r.is_current,
    r.created_at
  FROM public.app_android_releases r
  ORDER BY r.version_code DESC, r.created_at DESC
  LIMIT v_lim;
END;
$$;

DROP FUNCTION IF EXISTS public.superadmin_broadcast_app_update_notification(text);

CREATE OR REPLACE FUNCTION public.superadmin_broadcast_app_update_notification(
  p_custom_body   text DEFAULT NULL,
  p_version_name  text DEFAULT NULL,
  p_version_code  integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_row     public.app_android_releases%ROWTYPE;
  v_title   text := 'App update available';
  v_body    text;
  v_user    uuid;
  v_count   int := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_superadmin';
  END IF;

  IF p_version_code IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.app_android_releases r
    WHERE r.version_code = p_version_code
    ORDER BY r.created_at DESC
    LIMIT 1;
  ELSIF nullif(trim(p_version_name), '') IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.app_android_releases r
    WHERE r.version_name = trim(p_version_name)
    ORDER BY r.version_code DESC, r.created_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_row
    FROM public.app_android_releases r
    WHERE r.is_current = true
    ORDER BY r.version_code DESC, r.created_at DESC
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'release_not_found';
  END IF;

  v_body := coalesce(
    nullif(trim(p_custom_body), ''),
    format(
      'XEN %s (build %s) is ready to install. Open Settings → App update to download.',
      v_row.version_name,
      v_row.version_code::text
    )
  );

  FOR v_user IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role IN (
      'parent_student'::public.profile_role_v2,
      'teacher'::public.profile_role_v2,
      'admin'::public.profile_role_v2
    )
  LOOP
    INSERT INTO public.notifications (user_id, title, body, data)
    VALUES (
      v_user,
      v_title,
      v_body,
      jsonb_build_object(
        'type', 'app_update',
        'version_name', v_row.version_name,
        'version_code', v_row.version_code,
        'release_notes', COALESCE(v_row.release_notes, ''),
        'download_url', v_row.download_url,
        'route', '/parent-dashboard/settings/app-update'
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'notifications_sent', v_count,
    'version_name', v_row.version_name,
    'version_code', v_row.version_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_android_app_releases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_android_app_releases(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.superadmin_broadcast_app_update_notification(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_broadcast_app_update_notification(text, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
