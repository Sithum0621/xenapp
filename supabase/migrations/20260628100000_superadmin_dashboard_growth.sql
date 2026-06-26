-- Time-bucketed new sign-ups for superadmin dashboard growth chart (month = daily, year = monthly).

CREATE OR REPLACE FUNCTION public.superadmin_dashboard_growth(p_period text DEFAULT 'month')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text;
  v_labels text[];
  v_teachers int[];
  v_admins int[];
  v_students int[];
  v_institutes int[];
  r record;
BEGIN
  PERFORM public.superadmin_assert();

  v_period := lower(trim(coalesce(p_period, 'month')));
  IF v_period NOT IN ('month', 'year') THEN
    v_period := 'month';
  END IF;

  v_labels := ARRAY[]::text[];
  v_teachers := ARRAY[]::int[];
  v_admins := ARRAY[]::int[];
  v_students := ARRAY[]::int[];
  v_institutes := ARRAY[]::int[];

  IF v_period = 'month' THEN
    FOR r IN
      WITH buckets AS (
        SELECT
          gs::date AS bucket_date,
          to_char(gs::date, 'DD') AS bucket_label
        FROM generate_series(
          date_trunc('month', (now() AT TIME ZONE 'UTC'))::date,
          (now() AT TIME ZONE 'UTC')::date,
          interval '1 day'
        ) AS gs
      )
      SELECT
        b.bucket_label,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'teacher'::public.profile_role_v2
            AND (u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS teachers,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'admin'::public.profile_role_v2
            AND (u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS admins,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'parent_student'::public.profile_role_v2
            AND (u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS students,
        coalesce((
          SELECT count(*)::int
          FROM public.institutes i
          WHERE (i.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS institutes
      FROM buckets b
      ORDER BY b.bucket_date
    LOOP
      v_labels := array_append(v_labels, r.bucket_label);
      v_teachers := array_append(v_teachers, r.teachers);
      v_admins := array_append(v_admins, r.admins);
      v_students := array_append(v_students, r.students);
      v_institutes := array_append(v_institutes, r.institutes);
    END LOOP;
  ELSE
    FOR r IN
      WITH buckets AS (
        SELECT
          gs::date AS bucket_date,
          to_char(gs::date, 'Mon') AS bucket_label
        FROM generate_series(
          date_trunc('year', (now() AT TIME ZONE 'UTC'))::date,
          date_trunc('month', (now() AT TIME ZONE 'UTC'))::date,
          interval '1 month'
        ) AS gs
      )
      SELECT
        b.bucket_label,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'teacher'::public.profile_role_v2
            AND date_trunc('month', u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS teachers,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'admin'::public.profile_role_v2
            AND date_trunc('month', u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS admins,
        coalesce((
          SELECT count(*)::int
          FROM auth.users u
          INNER JOIN public.profiles p ON p.id = u.id
          WHERE p.role = 'parent_student'::public.profile_role_v2
            AND date_trunc('month', u.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS students,
        coalesce((
          SELECT count(*)::int
          FROM public.institutes i
          WHERE date_trunc('month', i.created_at AT TIME ZONE 'UTC')::date = b.bucket_date
        ), 0) AS institutes
      FROM buckets b
      ORDER BY b.bucket_date
    LOOP
      v_labels := array_append(v_labels, r.bucket_label);
      v_teachers := array_append(v_teachers, r.teachers);
      v_admins := array_append(v_admins, r.admins);
      v_students := array_append(v_students, r.students);
      v_institutes := array_append(v_institutes, r.institutes);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'period', v_period,
    'labels', to_jsonb(v_labels),
    'series', jsonb_build_object(
      'teachers', to_jsonb(v_teachers),
      'admins', to_jsonb(v_admins),
      'students', to_jsonb(v_students),
      'institutes', to_jsonb(v_institutes)
    ),
    'totals', jsonb_build_object(
      'teachers', coalesce((SELECT sum(x) FROM unnest(v_teachers) AS x), 0),
      'admins', coalesce((SELECT sum(x) FROM unnest(v_admins) AS x), 0),
      'students', coalesce((SELECT sum(x) FROM unnest(v_students) AS x), 0),
      'institutes', coalesce((SELECT sum(x) FROM unnest(v_institutes) AS x), 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_dashboard_growth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_dashboard_growth(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
