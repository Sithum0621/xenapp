-- Period-over-period growth % for superadmin dashboard charts.

CREATE OR REPLACE FUNCTION public.superadmin_growth_pct(p_current int, p_previous int)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_previous, 0) <= 0 THEN
      CASE WHEN coalesce(p_current, 0) <= 0 THEN 0::numeric ELSE 100::numeric END
    ELSE round(((p_current - p_previous)::numeric / p_previous) * 100, 1)
  END;
$$;

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
  v_tot_teachers int;
  v_tot_admins int;
  v_tot_students int;
  v_tot_institutes int;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_prev_teachers int;
  v_prev_admins int;
  v_prev_students int;
  v_prev_institutes int;
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

    v_prev_start := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '1 month');
    v_prev_end := date_trunc('month', (now() AT TIME ZONE 'UTC'));
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

    v_prev_start := date_trunc('year', (now() AT TIME ZONE 'UTC') - interval '1 year');
    v_prev_end := v_prev_start + ((now() AT TIME ZONE 'UTC') - date_trunc('year', (now() AT TIME ZONE 'UTC')));
  END IF;

  v_tot_teachers := coalesce((SELECT sum(x) FROM unnest(v_teachers) AS x), 0);
  v_tot_admins := coalesce((SELECT sum(x) FROM unnest(v_admins) AS x), 0);
  v_tot_students := coalesce((SELECT sum(x) FROM unnest(v_students) AS x), 0);
  v_tot_institutes := coalesce((SELECT sum(x) FROM unnest(v_institutes) AS x), 0);

  SELECT count(*)::int INTO v_prev_teachers
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE p.role = 'teacher'::public.profile_role_v2
    AND u.created_at >= v_prev_start
    AND u.created_at < v_prev_end;

  SELECT count(*)::int INTO v_prev_admins
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE p.role = 'admin'::public.profile_role_v2
    AND u.created_at >= v_prev_start
    AND u.created_at < v_prev_end;

  SELECT count(*)::int INTO v_prev_students
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE p.role = 'parent_student'::public.profile_role_v2
    AND u.created_at >= v_prev_start
    AND u.created_at < v_prev_end;

  SELECT count(*)::int INTO v_prev_institutes
  FROM public.institutes i
  WHERE i.created_at >= v_prev_start
    AND i.created_at < v_prev_end;

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
      'teachers', v_tot_teachers,
      'admins', v_tot_admins,
      'students', v_tot_students,
      'institutes', v_tot_institutes
    ),
    'growth_pct', jsonb_build_object(
      'teachers', public.superadmin_growth_pct(v_tot_teachers, v_prev_teachers),
      'admins', public.superadmin_growth_pct(v_tot_admins, v_prev_admins),
      'students', public.superadmin_growth_pct(v_tot_students, v_prev_students),
      'institutes', public.superadmin_growth_pct(v_tot_institutes, v_prev_institutes)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_growth_pct(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_dashboard_growth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_dashboard_growth(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
