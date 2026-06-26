-- Ensure profile + subscription exist immediately after Auth creates the user.
-- Fixes signup when email confirmation is ON (no JWT yet): client-side INSERT into profiles/subscriptions fails RLS.

CREATE OR REPLACE FUNCTION public.handle_auth_user_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  v_role public.profile_role_v2;
  v_full_name text;
  v_nic text;
  v_trial_end timestamptz;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  v_full_name := NULLIF(trim(COALESCE(meta->>'full_name', '')), '');

  IF meta ? 'role' AND length(trim(COALESCE(meta->>'role', ''))) > 0 THEN
    BEGIN
      v_role := trim(meta->>'role')::public.profile_role_v2;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_role := 'parent_student'::public.profile_role_v2;
    END;
  ELSE
    v_role := 'parent_student'::public.profile_role_v2;
  END IF;

  v_nic := NULLIF(trim(COALESCE(meta->>'nic_number', '')), '');
  IF v_nic IS NOT NULL THEN
    v_nic := public.normalize_profile_nic(v_nic);
  END IF;

  v_trial_end := now() + interval '30 days';

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    nic_number,
    trial_ends_at,
    subscription_status
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_role,
    v_nic,
    v_trial_end,
    'trial'
  );

  INSERT INTO public.subscriptions (
    user_id,
    device_id,
    expiry_date,
    is_active,
    updated_at
  )
  VALUES (
    NEW.id,
    'nic-bound',
    v_trial_end,
    true,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile_subscription ON auth.users;

CREATE TRIGGER on_auth_user_created_profile_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_after_insert();
