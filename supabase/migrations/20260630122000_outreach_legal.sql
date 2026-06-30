-- ============================================================
-- Outreach — conformidade legal (RGPD art. 14 + Lei 41/2004)
-- Base legal por lead, lista de supressão (do-not-contact),
-- opt-out e aviso de conformidade antes de campanhas.
-- ============================================================

-- 1) Base legal + opt-out por lead
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS consent_notes text,
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.outreach_leads
    ADD CONSTRAINT outreach_leads_legal_basis_chk
    CHECK (legal_basis IS NULL OR legal_basis IN ('consent','legitimate_interest','pre_contractual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Permitir estado 'suppressed' nas mensagens
ALTER TABLE public.outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_status_check;
ALTER TABLE public.outreach_messages
  ADD CONSTRAINT outreach_messages_status_check
  CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','failed','suppressed'));

-- 3) Lista de supressão (do-not-contact) por canal
CREATE TABLE IF NOT EXISTS public.outreach_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
  value text NOT NULL,              -- email normalizado (lower) ou telefone só dígitos
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel, value)
);
CREATE INDEX IF NOT EXISTS outreach_suppression_lookup_idx
  ON public.outreach_suppression(organization_id, channel, value);
GRANT SELECT, INSERT, DELETE ON public.outreach_suppression TO authenticated;
GRANT ALL ON public.outreach_suppression TO service_role;
ALTER TABLE public.outreach_suppression ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS osup_sel ON public.outreach_suppression;
CREATE POLICY osup_sel ON public.outreach_suppression FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS osup_ins ON public.outreach_suppression;
CREATE POLICY osup_ins ON public.outreach_suppression FOR INSERT WITH CHECK (public.outreach_can_write(organization_id));
DROP POLICY IF EXISTS osup_del ON public.outreach_suppression;
CREATE POLICY osup_del ON public.outreach_suppression FOR DELETE USING (public.outreach_can_write(organization_id));

-- 4) Definições de outreach por org (aviso de conformidade aceite)
CREATE TABLE IF NOT EXISTS public.outreach_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  compliance_ack_at timestamptz,
  compliance_ack_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.outreach_settings TO authenticated;
GRANT ALL ON public.outreach_settings TO service_role;
ALTER TABLE public.outreach_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oset_sel ON public.outreach_settings;
CREATE POLICY oset_sel ON public.outreach_settings FOR SELECT USING (public.is_org_member(organization_id));

-- 5) RPC — confirmar aviso de conformidade
CREATE OR REPLACE FUNCTION public.outreach_ack_compliance(_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.outreach_can_write(_org_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.outreach_settings (organization_id, compliance_ack_at, compliance_ack_by, updated_at)
  VALUES (_org_id, now(), auth.uid(), now())
  ON CONFLICT (organization_id) DO UPDATE
    SET compliance_ack_at = now(), compliance_ack_by = auth.uid(), updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.outreach_ack_compliance(uuid) TO authenticated;

-- 6) RPC — adicionar à lista de supressão (normaliza o valor)
CREATE OR REPLACE FUNCTION public.outreach_add_suppression(
  _org_id uuid, _channel text, _value text, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_val text;
BEGIN
  IF NOT public.outreach_can_write(_org_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _channel NOT IN ('email','whatsapp','sms') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
  v_val := CASE WHEN _channel = 'email' THEN lower(trim(_value))
                ELSE regexp_replace(coalesce(_value,''), '\D', '', 'g') END;
  IF v_val = '' THEN RAISE EXCEPTION 'empty_value'; END IF;
  INSERT INTO public.outreach_suppression (organization_id, channel, value, reason, created_by)
  VALUES (_org_id, _channel, v_val, _reason, auth.uid())
  ON CONFLICT (organization_id, channel, value) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.outreach_add_suppression(uuid, text, text, text) TO authenticated;

-- 7) RPC — opt-out de um lead (marca + adiciona email/telefone à supressão)
CREATE OR REPLACE FUNCTION public.outreach_lead_opt_out(_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_email text; v_phone text;
BEGIN
  SELECT organization_id, email, phone INTO v_org, v_email, v_phone
    FROM public.outreach_leads WHERE id = _lead_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF NOT public.outreach_can_write(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.outreach_leads SET opted_out = true, opted_out_at = now() WHERE id = _lead_id;
  IF v_email IS NOT NULL AND trim(v_email) <> '' THEN
    PERFORM public.outreach_add_suppression(v_org, 'email', v_email, 'lead_opt_out');
  END IF;
  IF v_phone IS NOT NULL AND trim(v_phone) <> '' THEN
    PERFORM public.outreach_add_suppression(v_org, 'whatsapp', v_phone, 'lead_opt_out');
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.outreach_lead_opt_out(uuid) TO authenticated;
