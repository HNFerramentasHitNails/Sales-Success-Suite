-- Task 11 — identidade legal por organização (modelo white-label: cada org é vendedor)
-- e informação pré-contratual ao consumidor (DL 24/2014).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_name      text,
  ADD COLUMN IF NOT EXISTS tax_id          text,
  ADD COLUMN IF NOT EXISTS legal_address   text,
  ADD COLUMN IF NOT EXISTS legal_email     text,
  ADD COLUMN IF NOT EXISTS legal_phone     text,
  ADD COLUMN IF NOT EXISTS return_policy   text,
  ADD COLUMN IF NOT EXISTS withdrawal_days integer NOT NULL DEFAULT 14;
