-- Extended profile fields for teacher/parent contact details and NIC scan storage paths.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS nic_document_front_path text,
  ADD COLUMN IF NOT EXISTS nic_document_back_path text;

COMMENT ON COLUMN public.profiles.first_name IS 'Given name; combined with last_name into full_name where useful.';
COMMENT ON COLUMN public.profiles.last_name IS 'Family name; combined with first_name into full_name where useful.';
COMMENT ON COLUMN public.profiles.mobile_number IS 'Contact phone (display / verification flows).';
COMMENT ON COLUMN public.profiles.address IS 'Postal or residential address text.';
COMMENT ON COLUMN public.profiles.nic_document_front_path IS 'Supabase Storage object path under bucket profile-nic-documents (folder = user id).';
COMMENT ON COLUMN public.profiles.nic_document_back_path IS 'Supabase Storage object path for NIC back image.';

-- Private bucket for NIC scans; paths like "{auth.uid()}/nic-front.jpg".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-nic-documents',
  'profile-nic-documents',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "profile_nic_documents_insert_own" ON storage.objects;
CREATE POLICY "profile_nic_documents_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-nic-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_nic_documents_select_own" ON storage.objects;
CREATE POLICY "profile_nic_documents_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-nic-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_nic_documents_update_own" ON storage.objects;
CREATE POLICY "profile_nic_documents_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-nic-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_nic_documents_delete_own" ON storage.objects;
CREATE POLICY "profile_nic_documents_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-nic-documents'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
