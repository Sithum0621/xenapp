-- PostgREST (authenticated JWT) cannot read lecture groups until table privileges exist.
-- RLS continues to gate which rows teachers see; junction + group reads rely on SELECT grants.

GRANT SELECT ON public.lecture_group_teachers TO authenticated;
GRANT SELECT ON public.lecture_groups TO authenticated;

NOTIFY pgrst, 'reload schema';
