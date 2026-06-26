CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  expiry_date timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_device_id_idx ON public.subscriptions(device_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_insert_own" ON public.subscriptions;
CREATE POLICY "subscriptions_insert_own"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_update_own" ON public.subscriptions;
CREATE POLICY "subscriptions_update_own"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_delete_own" ON public.subscriptions;
CREATE POLICY "subscriptions_delete_own"
  ON public.subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_subscription_access(p_user_id uuid, p_device_id text)
RETURNS TABLE (
  can_access boolean,
  reason text,
  expiry_date timestamptz,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub_record public.subscriptions%ROWTYPE;
BEGIN
  SELECT *
  INTO sub_record
  FROM public.subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::timestamptz, false;
    RETURN;
  END IF;

  IF sub_record.device_id IS DISTINCT FROM p_device_id THEN
    RETURN QUERY SELECT false, 'device_mismatch'::text, sub_record.expiry_date, sub_record.is_active;
    RETURN;
  END IF;

  IF now() > sub_record.expiry_date THEN
    UPDATE public.subscriptions
    SET
      is_active = false,
      updated_at = now()
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT false, 'expired'::text, sub_record.expiry_date, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::text, sub_record.expiry_date, sub_record.is_active;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_subscription_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_subscription_access(uuid, text) TO authenticated;
