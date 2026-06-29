-- ============================================================
-- OUTREACH WhatsApp (Evolution API) — config + instâncias
-- ============================================================

-- 1) Config da ligação Evolution por org. A api_key NUNCA é acessível ao cliente:
--    RLS ativa e sem políticas para 'authenticated' (só service_role lê via edge functions).
CREATE TABLE IF NOT EXISTS public.outreach_whatsapp_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_url text NOT NULL DEFAULT 'https://whatsapp.janeiras.synology.me',
  api_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.outreach_whatsapp_settings TO service_role;
ALTER TABLE public.outreach_whatsapp_settings ENABLE ROW LEVEL SECURITY;
-- sem políticas para authenticated: acesso só por service_role (edge functions)

-- 2) Instâncias WhatsApp (sem segredos -> legível por membros)
CREATE TABLE IF NOT EXISTS public.outreach_whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'connecting' CHECK (status IN ('connecting','open','close')),
  phone text,
  connected_at timestamptz,
  skip_warmup boolean NOT NULL DEFAULT false,
  day date,
  daily_sent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS outreach_wa_instances_org_idx ON public.outreach_whatsapp_instances(organization_id);
GRANT SELECT ON public.outreach_whatsapp_instances TO authenticated;
GRANT ALL ON public.outreach_whatsapp_instances TO service_role;
ALTER TABLE public.outreach_whatsapp_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owi_sel ON public.outreach_whatsapp_instances;
CREATE POLICY owi_sel ON public.outreach_whatsapp_instances FOR SELECT USING (public.is_org_member(organization_id));
-- escrita só via service_role (edge function outreach-whatsapp)

DROP TRIGGER IF EXISTS trg_outreach_wa_instances_touch ON public.outreach_whatsapp_instances;
CREATE TRIGGER trg_outreach_wa_instances_touch BEFORE UPDATE ON public.outreach_whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.outreach_touch();
