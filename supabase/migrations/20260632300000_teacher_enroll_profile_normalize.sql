-- Teacher student registration: auth lookup + normalized profile/contact writes.

-- Resolve synthetic or email login to auth.users.id (service role / edge functions).
CREATE OR REPLACE FUNCTION public.lookup_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(trim(COALESCE(u.email, ''))) = lower(trim(COALESCE(p_email, '')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_auth_user_id_by_email(text) TO service_role;

-- Upsert contact fields on profiles_contact and identity fields on profiles (single transaction).
CREATE OR REPLACE FUNCTION public.teacher_upsert_student_profile(
  p_student_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_full_name text,
  p_address text,
  p_mobile_number text,
  p_password_created_at timestamptz,
  p_temp_password_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_student_user_id
      AND p.role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'not_a_student';
  END IF;

  UPDATE public.profiles
  SET
    first_name = NULLIF(trim(COALESCE(p_first_name, '')), ''),
    last_name = NULLIF(trim(COALESCE(p_last_name, '')), ''),
    full_name = NULLIF(trim(COALESCE(p_full_name, '')), '')
  WHERE id = p_student_user_id;

  INSERT INTO public.profiles_contact (
    id,
    mobile_number,
    address,
    password_created_at,
    temp_password_expires_at
  )
  VALUES (
    p_student_user_id,
    NULLIF(trim(COALESCE(p_mobile_number, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    p_password_created_at,
    p_temp_password_expires_at
  )
  ON CONFLICT (id) DO UPDATE
  SET
    mobile_number = EXCLUDED.mobile_number,
    address = EXCLUDED.address,
    password_created_at = EXCLUDED.password_created_at,
    temp_password_expires_at = EXCLUDED.temp_password_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_upsert_student_profile(uuid, text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_upsert_student_profile(uuid, text, text, text, text, text, timestamptz, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
