-- Marketplace: distinguir potenciais revendedores dos restantes leads.
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS is_reseller boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS outreach_leads_reseller_idx
  ON public.outreach_leads(organization_id, is_reseller) WHERE is_reseller = true;
