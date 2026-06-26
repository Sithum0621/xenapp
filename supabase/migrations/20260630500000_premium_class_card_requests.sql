-- Premium printed class card requests (parent → superadmin fulfillment).

CREATE TABLE IF NOT EXISTS public.premium_class_card_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  parent_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT premium_class_card_requests_status_check
    CHECK (status IN ('pending', 'reviewed', 'fulfilled', 'cancelled')),
  CONSTRAINT premium_class_card_requests_parent_notes_len
    CHECK (parent_notes IS NULL OR length(trim(parent_notes)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS premium_class_card_requests_one_pending_per_student_idx
  ON public.premium_class_card_requests (student_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS premium_class_card_requests_status_created_idx
  ON public.premium_class_card_requests (status, created_at DESC);

COMMENT ON TABLE public.premium_class_card_requests IS
  'Parent requests for a premium printed XEN class card for a linked student.';

ALTER TABLE public.premium_class_card_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Parent: submit request
-- ---------------------------------------------------------------------------

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
      AND r.status = 'pending'
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
    'pending',
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

-- ---------------------------------------------------------------------------
-- Superadmin: pending count (new incoming)
-- ---------------------------------------------------------------------------

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
  WHERE r.status = 'pending';

  RETURN jsonb_build_object('count', coalesce(v_count, 0));
END;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin: list requests
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.superadmin_list_premium_card_requests(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_search text;
  v_limit int := 50;
  v_offset int := 0;
  v_total bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.superadmin_assert();

  v_status := lower(trim(coalesce(p_filters->>'status', '')));
  v_search := trim(coalesce(p_filters->>'search', ''));

  BEGIN
    v_limit := least(greatest(coalesce((p_filters->>'limit')::int, 50), 1), 100);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_limit := 50;
  END;

  BEGIN
    v_offset := greatest(coalesce((p_filters->>'offset')::int, 0), 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_offset := 0;
  END;

  SELECT count(*)::bigint INTO v_total
  FROM public.premium_class_card_requests r
  INNER JOIN public.profiles sp ON sp.id = r.student_user_id
  LEFT JOIN public.profiles_contact spc ON spc.id = sp.id
  INNER JOIN public.profiles rp ON rp.id = r.requested_by_user_id
  LEFT JOIN auth.users su ON su.id = sp.id
  LEFT JOIN auth.users ru ON ru.id = rp.id
  WHERE (
    length(v_status) = 0
    OR v_status = 'all'
    OR r.status = v_status
  )
  AND (
    length(v_search) = 0
    OR coalesce(sp.xen_student_id, '') ILIKE '%' || v_search || '%'
    OR coalesce(sp.full_name, '') ILIKE '%' || v_search || '%'
    OR coalesce(sp.first_name, '') ILIKE '%' || v_search || '%'
    OR coalesce(sp.last_name, '') ILIKE '%' || v_search || '%'
    OR coalesce(spc.mobile_number, '') ILIKE '%' || v_search || '%'
    OR coalesce(su.email, '') ILIKE '%' || v_search || '%'
    OR coalesce(rp.full_name, '') ILIKE '%' || v_search || '%'
    OR coalesce(ru.email, '') ILIKE '%' || v_search || '%'
  );

  SELECT coalesce(
    jsonb_agg(row_data ORDER BY sort_created DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'parent_notes', r.parent_notes,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'reviewed_at', r.reviewed_at,
        'student_user_id', r.student_user_id,
        'student_full_name', coalesce(
          nullif(trim(sp.full_name), ''),
          nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)), ''),
          ''
        ),
        'student_xen_id', coalesce(sp.xen_student_id, ''),
        'student_mobile', coalesce(spc.mobile_number, ''),
        'student_email', coalesce(su.email, ''),
        'requested_by_user_id', r.requested_by_user_id,
        'requester_full_name', coalesce(
          nullif(trim(rp.full_name), ''),
          nullif(trim(concat_ws(' ', rp.first_name, rp.last_name)), ''),
          ''
        ),
        'requester_email', coalesce(ru.email, '')
      ) AS row_data,
      r.created_at AS sort_created
    FROM public.premium_class_card_requests r
    INNER JOIN public.profiles sp ON sp.id = r.student_user_id
    LEFT JOIN public.profiles_contact spc ON spc.id = sp.id
    INNER JOIN public.profiles rp ON rp.id = r.requested_by_user_id
    LEFT JOIN auth.users su ON su.id = sp.id
    LEFT JOIN auth.users ru ON ru.id = rp.id
    WHERE (
      length(v_status) = 0
      OR v_status = 'all'
      OR r.status = v_status
    )
    AND (
      length(v_search) = 0
      OR coalesce(sp.xen_student_id, '') ILIKE '%' || v_search || '%'
      OR coalesce(sp.full_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(sp.first_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(sp.last_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(spc.mobile_number, '') ILIKE '%' || v_search || '%'
      OR coalesce(su.email, '') ILIKE '%' || v_search || '%'
      OR coalesce(rp.full_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(ru.email, '') ILIKE '%' || v_search || '%'
    )
    ORDER BY r.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object('total', v_total, 'requests', v_rows);
END;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin: update status
-- ---------------------------------------------------------------------------

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

  IF v_id IS NULL OR v_status NOT IN ('pending', 'reviewed', 'fulfilled', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  UPDATE public.premium_class_card_requests
  SET
    status = v_status,
    updated_at = now(),
    reviewed_at = CASE
      WHEN v_status IN ('reviewed', 'fulfilled', 'cancelled') THEN coalesce(reviewed_at, now())
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

REVOKE ALL ON FUNCTION public.parent_request_premium_class_card(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_premium_card_requests_pending_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_list_premium_card_requests(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_set_premium_card_request_status(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.parent_request_premium_class_card(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_premium_card_requests_pending_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_list_premium_card_requests(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_set_premium_card_request_status(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
