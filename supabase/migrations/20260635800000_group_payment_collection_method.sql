-- Distinguish manual class-fee recording from in-app collections (wallet / online).

DO $$ BEGIN
  CREATE TYPE public.group_payment_collection_method AS ENUM ('manual', 'wallet', 'online');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.group_payment_records
  ADD COLUMN IF NOT EXISTS collection_method public.group_payment_collection_method NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.group_payment_records.collection_method IS
  'manual = teacher-recorded cash/offline; wallet = student wallet debit; online = payment gateway.';

NOTIFY pgrst, 'reload schema';
