-- Document extended teacher/parent profile columns (schema already applied in 20260525120000).
-- Teachers are rows in public.profiles with role = 'teacher'; there is no separate teachers table.

COMMENT ON TABLE public.profiles IS
  'Wovello Education: app profile linked 1:1 to auth.users (roles: superadmin, admin, teacher, parent_student). '
  'Teachers are not a separate table; use role = teacher. '
  'Extended fields first_name, last_name, mobile_number, address, nic_number, nic_document_*_path support the profile editor and NIC uploads.';

COMMENT ON COLUMN public.profiles.full_name IS
  'Display name; may mirror concat(first_name, last_name) when both are set in the app.';

COMMENT ON COLUMN public.profiles.nic_number IS
  'National Identity Card number; normalized and validated by profiles_validate_nic_format.';
