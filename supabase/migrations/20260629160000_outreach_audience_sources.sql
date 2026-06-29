-- ============================================================
-- OUTREACH — audiências de campanha a partir de Leads / Clientes / Prospects
-- Mantém o motor em outreach_leads; clientes/prospects são materializados
-- nesse pool (com ligação de volta), sem poluir o funil de vendas.
-- ============================================================

-- ligação de volta ao cliente (prospect_id já existe)
ALTER TABLE public.outreach_leads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- permitir as novas origens
ALTER TABLE public.outreach_leads DROP CONSTRAINT IF EXISTS outreach_leads_source_check;
ALTER TABLE public.outreach_leads ADD CONSTRAINT outreach_leads_source_check
  CHECK (source IN ('manual','imported','marketplace','customer','prospect'));

-- índices para dedup rápido
CREATE INDEX IF NOT EXISTS outreach_leads_customer_idx ON public.outreach_leads(organization_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_leads_prospect_idx ON public.outreach_leads(organization_id, prospect_id) WHERE prospect_id IS NOT NULL;

-- RPC: inscreve uma lista de recipientes (por fonte) numa campanha,
-- materializando clientes/prospects em outreach_leads se necessário (dedup).
CREATE OR REPLACE FUNCTION public.enroll_campaign(_campaign_id uuid, _source text, _ids uuid[], _when timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_lead_ids uuid[]; n int;
BEGIN
  SELECT organization_id INTO v_org FROM public.outreach_campaigns WHERE id = _campaign_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'campanha não encontrada'; END IF;
  IF NOT public.outreach_can_write(v_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  IF _source = 'customers' THEN
    INSERT INTO public.outreach_leads(organization_id, customer_id, name, email, phone, company, city, country, source)
    SELECT c.organization_id, c.id, c.name, c.email, c.phone, c.company_name, c.city, c.country, 'customer'
    FROM public.customers c
    WHERE c.id = ANY(_ids) AND c.organization_id = v_org AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.outreach_leads ol WHERE ol.organization_id = v_org AND ol.customer_id = c.id);
    SELECT array_agg(id) INTO v_lead_ids FROM public.outreach_leads
      WHERE organization_id = v_org AND customer_id = ANY(_ids) AND deleted_at IS NULL;

  ELSIF _source = 'prospects' THEN
    INSERT INTO public.outreach_leads(organization_id, prospect_id, name, company, email, phone, source)
    SELECT p.organization_id, p.id, p.name, p.company_name, p.email, p.phone, 'prospect'
    FROM public.prospects p
    WHERE p.id = ANY(_ids) AND p.organization_id = v_org AND (p.email IS NOT NULL OR p.phone IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.outreach_leads ol WHERE ol.organization_id = v_org AND ol.prospect_id = p.id);
    SELECT array_agg(id) INTO v_lead_ids FROM public.outreach_leads
      WHERE organization_id = v_org AND prospect_id = ANY(_ids) AND deleted_at IS NULL;

  ELSE -- leads
    SELECT array_agg(id) INTO v_lead_ids FROM public.outreach_leads
      WHERE organization_id = v_org AND id = ANY(_ids) AND deleted_at IS NULL;
  END IF;

  IF v_lead_ids IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.outreach_campaign_targets(organization_id, campaign_id, lead_id, status, current_step, next_action_at)
  SELECT v_org, _campaign_id, lid, 'pending', 0, _when FROM unnest(v_lead_ids) lid
  ON CONFLICT (campaign_id, lead_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.enroll_campaign(uuid, text, uuid[], timestamptz) TO authenticated;
