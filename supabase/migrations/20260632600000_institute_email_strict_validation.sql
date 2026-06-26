-- Strict, case-insensitive institute email validation (mirrors src/utils/emailValidation.ts).

CREATE OR REPLACE FUNCTION public.is_valid_email_address(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
  at_pos int;
  local_part text;
  domain_part text;
  tld text;
BEGIN
  v := lower(trim(coalesce(p_value, '')));
  IF length(v) = 0 OR length(v) > 254 THEN
    RETURN false;
  END IF;

  IF v ~ '\s' THEN
    RETURN false;
  END IF;

  at_pos := strpos(v, '@');
  IF at_pos <= 1 OR at_pos <> length(v) - length(split_part(v, '@', 2)) THEN
    RETURN false;
  END IF;

  local_part := split_part(v, '@', 1);
  domain_part := split_part(v, '@', 2);

  IF length(local_part) > 64 OR length(domain_part) > 253 THEN
    RETURN false;
  END IF;

  IF local_part LIKE '.%' OR local_part LIKE '%.' OR local_part LIKE '%..%' THEN
    RETURN false;
  END IF;

  IF domain_part LIKE '.%' OR domain_part LIKE '%.' OR domain_part LIKE '%..%' THEN
    RETURN false;
  END IF;

  IF local_part !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*$' THEN
    RETURN false;
  END IF;

  IF domain_part !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' THEN
    RETURN false;
  END IF;

  tld := split_part(domain_part, '.', array_length(string_to_array(domain_part, '.'), 1));
  IF tld IS NULL OR tld !~ '^[a-z]{2,63}$' THEN
    RETURN false;
  END IF;

  RETURN true;
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
  IF NOT public.is_valid_email_address(v) THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_email_address(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_email_address(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
