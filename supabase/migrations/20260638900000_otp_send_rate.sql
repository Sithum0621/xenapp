-- Persistent OTP send rate limit (survives Edge Function cold starts).
-- Consumed only by signup-mobile-otp via service_role.

CREATE TABLE IF NOT EXISTS public.otp_send_rate (
  phone_e164 text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  last_sent_at timestamptz NOT NULL
);

ALTER TABLE public.otp_send_rate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.otp_send_rate FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.otp_send_rate TO service_role;

CREATE OR REPLACE FUNCTION public.otp_send_rate_consume(
  p_phone text,
  p_window_seconds integer DEFAULT 900,
  p_max_sends integer DEFAULT 5,
  p_cooldown_seconds integer DEFAULT 45
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_phone text := btrim(COALESCE(p_phone, ''));
  v_window_start timestamptz;
  v_count integer;
  v_last timestamptz;
BEGIN
  IF length(v_phone) < 8 THEN
    RETURN 'invalid_mobile';
  END IF;

  INSERT INTO public.otp_send_rate (phone_e164, window_start, send_count, last_sent_at)
  VALUES (v_phone, v_now, 0, v_now - interval '1 day')
  ON CONFLICT (phone_e164) DO NOTHING;

  SELECT window_start, send_count, last_sent_at
    INTO v_window_start, v_count, v_last
  FROM public.otp_send_rate
  WHERE phone_e164 = v_phone
  FOR UPDATE;

  IF v_last + make_interval(secs => GREATEST(p_cooldown_seconds, 0)) > v_now THEN
    RETURN 'otp_cooldown';
  END IF;

  IF v_window_start + make_interval(secs => GREATEST(p_window_seconds, 1)) <= v_now THEN
    v_window_start := v_now;
    v_count := 0;
  END IF;

  IF v_count >= GREATEST(p_max_sends, 1) THEN
    RETURN 'otp_rate_limited';
  END IF;

  UPDATE public.otp_send_rate
  SET
    window_start = v_window_start,
    send_count = v_count + 1,
    last_sent_at = v_now
  WHERE phone_e164 = v_phone;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.otp_send_rate_consume(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_send_rate_consume(text, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.otp_send_rate_consume(text, integer, integer, integer) IS
  'Atomically rate-limits OTP SMS sends per phone. Returns ok | otp_cooldown | otp_rate_limited | invalid_mobile.';
