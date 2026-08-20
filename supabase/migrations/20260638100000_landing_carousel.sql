-- Public marketing landing carousel (max 5 slides). Superadmin uploads to Storage.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-carousel',
  'landing-carousel',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/jpg'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS landing_carousel_select_public ON storage.objects;
CREATE POLICY landing_carousel_select_public
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'landing-carousel');

DROP POLICY IF EXISTS landing_carousel_insert_superadmin ON storage.objects;
CREATE POLICY landing_carousel_insert_superadmin
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'landing-carousel'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS landing_carousel_update_superadmin ON storage.objects;
CREATE POLICY landing_carousel_update_superadmin
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'landing-carousel'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

DROP POLICY IF EXISTS landing_carousel_delete_superadmin ON storage.objects;
CREATE POLICY landing_carousel_delete_superadmin
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'landing-carousel'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'superadmin'::public.profile_role_v2
    )
  );

CREATE TABLE IF NOT EXISTS public.landing_carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order integer NOT NULL DEFAULT 0,
  image_path text NOT NULL,
  public_url text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_carousel_slides_public_url_https CHECK (public_url ~* '^https://'),
  CONSTRAINT landing_carousel_slides_path_nonempty CHECK (length(trim(image_path)) > 0)
);

CREATE INDEX IF NOT EXISTS landing_carousel_slides_active_sort_idx
  ON public.landing_carousel_slides (is_active, sort_order, created_at);

COMMENT ON TABLE public.landing_carousel_slides IS
  'Marketing landing hero carousel slides (max 5 active). Files live in landing-carousel bucket.';

ALTER TABLE public.landing_carousel_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_carousel_slides_read_all ON public.landing_carousel_slides;
CREATE POLICY landing_carousel_slides_read_all
  ON public.landing_carousel_slides
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.landing_carousel_slides FROM PUBLIC;
GRANT SELECT ON TABLE public.landing_carousel_slides TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_landing_carousel()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'sort_order', s.sort_order,
        'public_url', s.public_url,
        'alt_text', COALESCE(s.alt_text, ''),
        'image_path', s.image_path
      )
      ORDER BY s.sort_order ASC, s.created_at ASC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT *
    FROM public.landing_carousel_slides
    WHERE is_active = true
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 5
  ) s;
$$;

REVOKE ALL ON FUNCTION public.get_landing_carousel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_landing_carousel() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_landing_carousel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.role = 'superadmin'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_superadmin';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'sort_order', s.sort_order,
          'public_url', s.public_url,
          'alt_text', COALESCE(s.alt_text, ''),
          'image_path', s.image_path,
          'is_active', s.is_active,
          'created_at', s.created_at
        )
        ORDER BY s.sort_order ASC, s.created_at ASC
      )
      FROM public.landing_carousel_slides s
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_landing_carousel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_landing_carousel() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_add_landing_carousel_slide(
  p_image_path text,
  p_public_url text,
  p_alt_text text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_active_count integer;
  v_next_order integer;
  v_row public.landing_carousel_slides%ROWTYPE;
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

  IF p_image_path IS NULL OR length(trim(p_image_path)) = 0 THEN
    RAISE EXCEPTION 'invalid_image_path';
  END IF;
  IF p_public_url IS NULL OR trim(p_public_url) !~* '^https://' THEN
    RAISE EXCEPTION 'invalid_public_url';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.landing_carousel_slides
  WHERE is_active = true;

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'carousel_full';
  END IF;

  SELECT COALESCE(max(sort_order), 0) + 1 INTO v_next_order
  FROM public.landing_carousel_slides;

  INSERT INTO public.landing_carousel_slides (
    sort_order, image_path, public_url, alt_text, is_active
  )
  VALUES (
    v_next_order,
    trim(p_image_path),
    trim(p_public_url),
    COALESCE(trim(p_alt_text), ''),
    true
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'sort_order', v_row.sort_order,
    'public_url', v_row.public_url,
    'alt_text', v_row.alt_text,
    'image_path', v_row.image_path,
    'is_active', v_row.is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_add_landing_carousel_slide(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_add_landing_carousel_slide(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_delete_landing_carousel_slide(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_path text;
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

  SELECT image_path INTO v_path
  FROM public.landing_carousel_slides
  WHERE id = p_id;

  IF v_path IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  DELETE FROM public.landing_carousel_slides WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'image_path', v_path);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_delete_landing_carousel_slide(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_landing_carousel_slide(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_reorder_landing_carousel_slide(
  p_id uuid,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_cur public.landing_carousel_slides%ROWTYPE;
  v_swap public.landing_carousel_slides%ROWTYPE;
  v_tmp integer;
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

  SELECT * INTO v_cur FROM public.landing_carousel_slides WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF lower(trim(p_direction)) = 'up' THEN
    SELECT * INTO v_swap
    FROM public.landing_carousel_slides
    WHERE sort_order < v_cur.sort_order
    ORDER BY sort_order DESC
    LIMIT 1;
  ELSIF lower(trim(p_direction)) = 'down' THEN
    SELECT * INTO v_swap
    FROM public.landing_carousel_slides
    WHERE sort_order > v_cur.sort_order
    ORDER BY sort_order ASC
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'invalid_direction';
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'moved', false);
  END IF;

  v_tmp := v_cur.sort_order;
  UPDATE public.landing_carousel_slides SET sort_order = v_swap.sort_order, updated_at = now()
  WHERE id = v_cur.id;
  UPDATE public.landing_carousel_slides SET sort_order = v_tmp, updated_at = now()
  WHERE id = v_swap.id;

  RETURN jsonb_build_object('ok', true, 'moved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_reorder_landing_carousel_slide(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_reorder_landing_carousel_slide(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
