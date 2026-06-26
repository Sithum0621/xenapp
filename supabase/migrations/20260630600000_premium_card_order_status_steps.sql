-- Premium card orders: four-step status workflow (new → processing → sending → received).

UPDATE public.premium_class_card_requests
SET status = 'new'
WHERE status = 'pending';

UPDATE public.premium_class_card_requests
SET status = 'processing'
WHERE status = 'reviewed';

UPDATE public.premium_class_card_requests
SET status = 'received'
WHERE status IN ('fulfilled', 'cancelled');

ALTER TABLE public.premium_class_card_requests
  DROP CONSTRAINT IF EXISTS premium_class_card_requests_status_check;

ALTER TABLE public.premium_class_card_requests
  ADD CONSTRAINT premium_class_card_requests_status_check
  CHECK (status IN ('new', 'processing', 'sending', 'received'));

DROP INDEX IF EXISTS public.premium_class_card_requests_one_pending_per_student_idx;

CREATE UNIQUE INDEX IF NOT EXISTS premium_class_card_requests_one_new_per_student_idx
  ON public.premium_class_card_requests (student_user_id)
  WHERE status = 'new';

CREATE OR REPLACE FUNCTION public.parent_request_premium_class_card(
  p_student_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.premium_class_card_requests%ROWTYPE;
  v_notes text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.parent_may_view_student(v_user, p_student_user_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_student_user_id
      AND p.role = 'parent_student'::public.profile_role_v2
  ) THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.premium_class_card_requests r
    WHERE r.student_user_id = p_student_user_id
      AND r.status = 'new'
  ) THEN
    RAISE EXCEPTION 'pending_request_exists';
  END IF;

  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  INSERT INTO public.premium_class_card_requests (
    student_user_id,
    requested_by_user_id,
    status,
    parent_notes
  )
  VALUES (
    p_student_user_id,
    v_user,
    'new',
    v_notes
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_premium_card_requests_pending_count()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  PERFORM public.superadmin_assert();

  SELECT count(*)::bigint INTO v_count
  FROM public.premium_class_card_requests r
  WHERE r.status = 'new';

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_premium_card_request_status(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_row public.premium_class_card_requests%ROWTYPE;
BEGIN
  PERFORM public.superadmin_assert();

  BEGIN
    v_id := (p_payload->>'request_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_request';
  END;

  v_status := lower(trim(coalesce(p_payload->>'status', '')));

  IF v_id IS NULL OR v_status NOT IN ('new', 'processing', 'sending', 'received') THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  UPDATE public.premium_class_card_requests
  SET
    status = v_status,
    updated_at = now(),
    reviewed_at = CASE
      WHEN v_status <> 'new' THEN coalesce(reviewed_at, now())
      ELSE reviewed_at
    END
  WHERE id = v_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'reviewed_at', v_row.reviewed_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
