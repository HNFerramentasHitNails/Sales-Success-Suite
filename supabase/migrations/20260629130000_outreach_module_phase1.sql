-- ============================================================
-- OUTREACH MODULE (LeadsPro) — Marco 1 (email ponta-a-ponta)
-- Tabelas dedicadas; prospects/customers NÃO são alteradas.
-- ============================================================

-- Trigger genérico de updated_at para as tabelas deste módulo
CREATE OR REPLACE FUNCTION public.outreach_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Helper: membro ativo que pode escrever (não read_only)
CREATE OR REPLACE FUNCTION public.outreach_can_write(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_member(_org_id) AND NOT public.has_org_role(_org_id, 'read_only');
$$;
GRANT EXECUTE ON FUNCTION public.outreach_can_write(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 1) outreach_leads
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  full_name text,
  email text,
  phone text,
  company text,
  country text,
  state text,
  city text,
  niche text,
  has_whatsapp boolean NOT NULL DEFAULT false,
  quality_score int,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contactado','respondeu')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','imported','marketplace')),
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_leads_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS outreach_leads_org_deleted_idx ON public.outreach_leads(organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS outreach_leads_org_status_idx ON public.outreach_leads(organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_leads TO authenticated;
GRANT ALL ON public.outreach_leads TO service_role;
ALTER TABLE public.outreach_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ol_sel ON public.outreach_leads;
CREATE POLICY ol_sel ON public.outreach_leads FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS ol_ins ON public.outreach_leads;
CREATE POLICY ol_ins ON public.outreach_leads FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS ol_upd ON public.outreach_leads;
CREATE POLICY ol_upd ON public.outreach_leads FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS ol_del ON public.outreach_leads;
CREATE POLICY ol_del ON public.outreach_leads FOR DELETE USING (public.is_org_admin(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_leads_touch ON public.outreach_leads;
CREATE TRIGGER trg_outreach_leads_touch BEFORE UPDATE ON public.outreach_leads FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- 2) outreach_templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  niche text,
  lead_stage text,
  objective text,
  tone text,
  language text NOT NULL DEFAULT 'pt-PT',
  channels text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_templates_org_idx ON public.outreach_templates(organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_templates TO authenticated;
GRANT ALL ON public.outreach_templates TO service_role;
ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ot_sel ON public.outreach_templates;
CREATE POLICY ot_sel ON public.outreach_templates FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS ot_ins ON public.outreach_templates;
CREATE POLICY ot_ins ON public.outreach_templates FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS ot_upd ON public.outreach_templates;
CREATE POLICY ot_upd ON public.outreach_templates FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS ot_del ON public.outreach_templates;
CREATE POLICY ot_del ON public.outreach_templates FOR DELETE USING (public.outreach_can_write(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_templates_touch ON public.outreach_templates;
CREATE TRIGGER trg_outreach_templates_touch BEFORE UPDATE ON public.outreach_templates FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- 3) outreach_template_variations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_template_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.outreach_templates(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  variation_index int NOT NULL DEFAULT 0,
  angle text,
  subject text,
  body text NOT NULL DEFAULT '',
  sends int NOT NULL DEFAULT 0,
  responses int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, channel, variation_index)
);
CREATE INDEX IF NOT EXISTS outreach_variations_tpl_idx ON public.outreach_template_variations(template_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_template_variations TO authenticated;
GRANT ALL ON public.outreach_template_variations TO service_role;
ALTER TABLE public.outreach_template_variations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS otv_sel ON public.outreach_template_variations;
CREATE POLICY otv_sel ON public.outreach_template_variations FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS otv_ins ON public.outreach_template_variations;
CREATE POLICY otv_ins ON public.outreach_template_variations FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS otv_upd ON public.outreach_template_variations;
CREATE POLICY otv_upd ON public.outreach_template_variations FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS otv_del ON public.outreach_template_variations;
CREATE POLICY otv_del ON public.outreach_template_variations FOR DELETE USING (public.outreach_can_write(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_variations_touch ON public.outreach_template_variations;
CREATE TRIGGER trg_outreach_variations_touch BEFORE UPDATE ON public.outreach_template_variations FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- 4) outreach_campaigns
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','waiting_for_quota','completed')),
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule_mode text NOT NULL DEFAULT 'immediate' CHECK (schedule_mode IN ('immediate','scheduled')),
  scheduled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_campaigns_org_idx ON public.outreach_campaigns(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_campaigns_status_idx ON public.outreach_campaigns(status) WHERE status = 'running';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oc_sel ON public.outreach_campaigns;
CREATE POLICY oc_sel ON public.outreach_campaigns FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS oc_ins ON public.outreach_campaigns;
CREATE POLICY oc_ins ON public.outreach_campaigns FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS oc_upd ON public.outreach_campaigns;
CREATE POLICY oc_upd ON public.outreach_campaigns FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS oc_del ON public.outreach_campaigns;
CREATE POLICY oc_del ON public.outreach_campaigns FOR DELETE USING (public.outreach_can_write(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_campaigns_touch ON public.outreach_campaigns;
CREATE TRIGGER trg_outreach_campaigns_touch BEFORE UPDATE ON public.outreach_campaigns FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- 5) outreach_campaign_targets  (enrolamento + estado da sequência + fila)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','replied','stopped')),
  current_step int NOT NULL DEFAULT 0,
  next_action_at timestamptz,
  last_channel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX IF NOT EXISTS outreach_targets_due_idx ON public.outreach_campaign_targets(next_action_at) WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS outreach_targets_campaign_idx ON public.outreach_campaign_targets(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaign_targets TO authenticated;
GRANT ALL ON public.outreach_campaign_targets TO service_role;
ALTER TABLE public.outreach_campaign_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oct_sel ON public.outreach_campaign_targets;
CREATE POLICY oct_sel ON public.outreach_campaign_targets FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS oct_ins ON public.outreach_campaign_targets;
CREATE POLICY oct_ins ON public.outreach_campaign_targets FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS oct_upd ON public.outreach_campaign_targets;
CREATE POLICY oct_upd ON public.outreach_campaign_targets FOR UPDATE USING (public.outreach_can_write(organization_id)) WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS oct_del ON public.outreach_campaign_targets;
CREATE POLICY oct_del ON public.outreach_campaign_targets FOR DELETE USING (public.outreach_can_write(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_targets_touch ON public.outreach_campaign_targets;
CREATE TRIGGER trg_outreach_targets_touch BEFORE UPDATE ON public.outreach_campaign_targets FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- 6) outreach_messages  (log de envio + eventos Resend)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.outreach_campaigns(id) ON DELETE SET NULL,
  target_id uuid REFERENCES public.outreach_campaign_targets(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE SET NULL,
  variation_id uuid REFERENCES public.outreach_template_variations(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','failed')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_messages_org_idx ON public.outreach_messages(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_messages_provider_idx ON public.outreach_messages(provider_message_id);
CREATE INDEX IF NOT EXISTS outreach_messages_campaign_idx ON public.outreach_messages(campaign_id);
GRANT SELECT ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS om_sel ON public.outreach_messages;
CREATE POLICY om_sel ON public.outreach_messages FOR SELECT USING (public.is_org_member(organization_id));
-- escrita apenas via service_role (edge functions); sem políticas de insert/update p/ authenticated

-- ------------------------------------------------------------
-- 7) outreach_channel_state  (quotas diárias/semanais + circuit-breaker)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_channel_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  day date,
  daily_sent int NOT NULL DEFAULT 0,
  week_start date,
  weekly_sent int NOT NULL DEFAULT 0,
  consecutive_failures int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','circuit_open')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel)
);
GRANT SELECT ON public.outreach_channel_state TO authenticated;
GRANT ALL ON public.outreach_channel_state TO service_role;
ALTER TABLE public.outreach_channel_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocs_sel ON public.outreach_channel_state;
CREATE POLICY ocs_sel ON public.outreach_channel_state FOR SELECT USING (public.is_org_member(organization_id));
-- escrita apenas via service_role

-- ------------------------------------------------------------
-- 8) outreach_email_domains  (identidade de envio + rotação/health)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  from_name text,
  resend_domain_id text,
  health_score int NOT NULL DEFAULT 100,
  daily_cap int NOT NULL DEFAULT 200,
  sent_today int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_email_domains TO authenticated;
GRANT ALL ON public.outreach_email_domains TO service_role;
ALTER TABLE public.outreach_email_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oed_sel ON public.outreach_email_domains;
CREATE POLICY oed_sel ON public.outreach_email_domains FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS oed_ins ON public.outreach_email_domains;
CREATE POLICY oed_ins ON public.outreach_email_domains FOR INSERT WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS oed_upd ON public.outreach_email_domains;
CREATE POLICY oed_upd ON public.outreach_email_domains FOR UPDATE USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS oed_del ON public.outreach_email_domains;
CREATE POLICY oed_del ON public.outreach_email_domains FOR DELETE USING (public.is_org_admin(organization_id));
DROP TRIGGER IF EXISTS trg_outreach_domains_touch ON public.outreach_email_domains;
CREATE TRIGGER trg_outreach_domains_touch BEFORE UPDATE ON public.outreach_email_domains FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();

-- ------------------------------------------------------------
-- RPC: promover lead -> prospect (funil de vendas)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_lead_to_prospect(_lead_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_lead public.outreach_leads; v_prospect uuid;
BEGIN
  SELECT * INTO v_lead FROM public.outreach_leads WHERE id = _lead_id AND deleted_at IS NULL;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'lead não encontrado'; END IF;
  v_org := v_lead.organization_id;
  IF NOT public.outreach_can_write(v_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF v_lead.prospect_id IS NOT NULL THEN RETURN v_lead.prospect_id; END IF;

  INSERT INTO public.prospects (organization_id, name, company_name, email, phone, source, pipeline_stage, created_by)
  VALUES (v_org, v_lead.name, v_lead.company, v_lead.email, v_lead.phone, 'outreach', 'novo', auth.uid())
  RETURNING id INTO v_prospect;

  UPDATE public.outreach_leads
     SET prospect_id = v_prospect, status = 'respondeu', updated_at = now()
   WHERE id = _lead_id;

  RETURN v_prospect;
END $$;
GRANT EXECUTE ON FUNCTION public.promote_lead_to_prospect(uuid) TO authenticated;

-- ------------------------------------------------------------
-- Feature flags do plano (entitlements)
-- ------------------------------------------------------------
INSERT INTO public.plan_features (plan_id, feature_key, enabled, limit_int)
SELECT p.id, x.feature_key, x.enabled, x.limit_int
FROM public.plans p
JOIN (VALUES
  ('trial','module_outreach', true, NULL::int),
  ('trial','max_leads', true, 200),
  ('trial','max_weekly_dispatches', true, 100),
  ('starter','module_outreach', true, NULL),
  ('starter','max_leads', true, 1000),
  ('starter','max_weekly_dispatches', true, 500),
  ('business','module_outreach', true, NULL),
  ('business','max_leads', true, 10000),
  ('business','max_weekly_dispatches', true, 1800),
  ('enterprise','module_outreach', true, NULL),
  ('enterprise','max_leads', true, NULL),
  ('enterprise','max_weekly_dispatches', true, NULL)
) AS x(plan_key, feature_key, enabled, limit_int) ON x.plan_key = p.key
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int;
