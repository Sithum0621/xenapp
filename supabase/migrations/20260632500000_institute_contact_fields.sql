-- Split institute address/contact into structured, validated fields.

ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS contact_number text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.institutes.address_line1 IS 'Primary address line (required for new records).';
COMMENT ON COLUMN public.institutes.address_line2 IS 'Secondary address line (optional).';
COMMENT ON COLUMN public.institutes.email IS 'Institute contact email.';
COMMENT ON COLUMN public.institutes.contact_number IS 'Canonical SL mobile/landline display (e.g. 07XXXXXXXX, 011XXXXXXX).';
COMMENT ON COLUMN public.institutes.notes IS 'Optional internal notes.';

-- Backfill from legacy single-line columns.
UPDATE public.institutes i
SET
  address_line1 = COALESCE(
    NULLIF(trim(i.address_line1), ''),
    NULLIF(trim(split_part(coalesce(i.address, ''), E'\n', 1)), '')
  ),
  address_line2 = COALESCE(
    NULLIF(trim(i.address_line2), ''),
    NULLIF(
      trim(
        CASE
          WHEN position(E'\n' IN coalesce(i.address, '')) > 0
            THEN substring(i.address FROM position(E'\n' IN i.address) + 1)
          ELSE ''
        END
      ),
      ''
    )
  ),
  notes = COALESCE(
    NULLIF(trim(i.notes), ''),
    NULLIF(trim(i.contact_info), '')
  )
WHERE i.address_line1 IS NULL
   OR i.address_line2 IS NULL
   OR (i.notes IS NULL AND i.contact_info IS NOT NULL);

CREATE OR REPLACE FUNCTION public.institute_validate_address_line(p_value text, p_required boolean)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := trim(coalesce(p_value, ''));
  IF p_required AND length(v) = 0 THEN
    RAISE EXCEPTION 'address_line1_required';
  END IF;
  IF length(v) = 0 THEN
    RETURN NULL;
  END IF;
  IF length(v) < 3 OR length(v) > 200 THEN
    RAISE EXCEPTION 'address_invalid';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.institute_validate_email(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := lower(trim(coalesce(p_value, '')));
  IF length(v) = 0 THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.institute_normalize_sl_phone(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
  national text;
  area text;
  subscriber text;
  areas text[] := ARRAY[
    '11','21','31','32','33','34','35','36','37','38',
    '41','45','47','51','52','54','55','57','63','65','66','67','81','91'
  ];
BEGIN
  digits := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  IF length(digits) = 0 THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  IF digits LIKE '0094%' THEN
    digits := substring(digits FROM 5);
  ELSIF digits LIKE '94%' THEN
    digits := substring(digits FROM 3);
  END IF;

  IF digits LIKE '0%' THEN
    digits := substring(digits FROM 2);
  END IF;

  national := digits;

  -- Mobile: 7XXXXXXXX
  IF national ~ '^7[0-9]{8}$' THEN
    RETURN '0' || national;
  END IF;

  -- Landline: area + 6–7 digit subscriber
  FOREACH area IN ARRAY areas LOOP
    IF national LIKE area || '%' THEN
      subscriber := substring(national FROM length(area) + 1);
      IF length(subscriber) BETWEEN 6 AND 7 AND subscriber ~ '^[0-9]+$' THEN
        RETURN '0' || area || subscriber;
      END IF;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'contact_invalid';
END;
$$;

CREATE OR REPLACE FUNCTION public.institute_sync_legacy_contact_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.address := trim(
    coalesce(NEW.address_line1, '')
    || CASE
      WHEN NEW.address_line2 IS NOT NULL AND length(trim(NEW.address_line2)) > 0
        THEN E'\n' || trim(NEW.address_line2)
      ELSE ''
    END
  );
  IF length(trim(coalesce(NEW.address, ''))) = 0 THEN
    NEW.address := NULL;
  END IF;

  NEW.contact_info := NULLIF(
    trim(
      concat_ws(
        E' · ',
        NULLIF(trim(coalesce(NEW.email, '')), ''),
        NULLIF(trim(coalesce(NEW.contact_number, '')), ''),
        NULLIF(trim(coalesce(NEW.notes, '')), '')
      )
    ),
    ''
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS institutes_sync_legacy_contact ON public.institutes;
CREATE TRIGGER institutes_sync_legacy_contact
BEFORE INSERT OR UPDATE ON public.institutes
FOR EACH ROW
EXECUTE FUNCTION public.institute_sync_legacy_contact_columns();

UPDATE public.institutes
SET name = name
WHERE id IS NOT NULL;

DROP FUNCTION IF EXISTS public.superadmin_create_institute(text, text, text);

CREATE OR REPLACE FUNCTION public.superadmin_create_institute(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_line1 text;
  v_line2 text;
  v_email text;
  v_phone text;
  v_notes text;
BEGIN
  PERFORM public.superadmin_assert();

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  v_line1 := public.institute_validate_address_line(p_payload->>'address_line1', true);
  v_line2 := public.institute_validate_address_line(p_payload->>'address_line2', false);
  v_email := public.institute_validate_email(p_payload->>'email');
  v_phone := public.institute_normalize_sl_phone(p_payload->>'contact_number');
  v_notes := NULLIF(trim(coalesce(p_payload->>'notes', '')), '');
  IF v_notes IS NOT NULL AND length(v_notes) > 500 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  INSERT INTO public.institutes (
    name,
    address_line1,
    address_line2,
    email,
    contact_number,
    notes
  )
  VALUES (v_name, v_line1, v_line2, v_email, v_phone, v_notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_create_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_create_institute(jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.superadmin_list_institutes(jsonb);

CREATE OR REPLACE FUNCTION public.superadmin_list_institutes(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  contact_info text,
  address_line1 text,
  address_line2 text,
  email text,
  contact_number text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_limit int := 40;
  v_offset int := 0;
BEGIN
  PERFORM public.superadmin_assert();

  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 40), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 40;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  RETURN QUERY
  SELECT
    i.id,
    i.name::text AS name,
    i.address::text AS address,
    i.contact_info::text AS contact_info,
    i.address_line1::text AS address_line1,
    i.address_line2::text AS address_line2,
    i.email::text AS email,
    i.contact_number::text AS contact_number,
    i.notes::text AS notes,
    i.created_at
  FROM public.institutes i
  WHERE (
    length(v_search) = 0
    OR i.name ILIKE '%' || v_search || '%'
    OR coalesce(i.address_line1, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.address_line2, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.address, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.email, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.contact_number, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.notes, '') ILIKE '%' || v_search || '%'
    OR coalesce(i.contact_info, '') ILIKE '%' || v_search || '%'
  )
  ORDER BY i.created_at DESC NULLS LAST
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_institutes(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_institutes(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_update_institute(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_id_raw text;
  v_name text;
  v_line1 text;
  v_line2 text;
  v_email text;
  v_phone text;
  v_notes text;
BEGIN
  PERFORM public.superadmin_assert();

  v_id_raw := trim(coalesce(p_payload->>'id', ''));
  IF length(v_id_raw) = 0 THEN
    RAISE EXCEPTION 'id_required';
  END IF;

  BEGIN
    v_id := v_id_raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_institute_id';
  END;

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  v_line1 := public.institute_validate_address_line(p_payload->>'address_line1', true);
  v_line2 := public.institute_validate_address_line(p_payload->>'address_line2', false);
  v_email := public.institute_validate_email(p_payload->>'email');
  v_phone := public.institute_normalize_sl_phone(p_payload->>'contact_number');
  v_notes := NULLIF(trim(coalesce(p_payload->>'notes', '')), '');
  IF v_notes IS NOT NULL AND length(v_notes) > 500 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  UPDATE public.institutes
  SET
    name = v_name,
    address_line1 = v_line1,
    address_line2 = v_line2,
    email = v_email,
    contact_number = v_phone,
    notes = v_notes
  WHERE id = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'institute_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_institute(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_update_institute(jsonb) TO authenticated;

CREATE INDEX IF NOT EXISTS institutes_email_trgm_idx
  ON public.institutes USING gin (email extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS institutes_contact_number_trgm_idx
  ON public.institutes USING gin (contact_number extensions.gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
