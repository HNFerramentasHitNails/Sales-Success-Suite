ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_valid boolean NULL,
  ADD COLUMN IF NOT EXISTS vat_validated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS vat_validated_name text NULL;