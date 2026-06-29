-- Enum
DO $$ BEGIN
  CREATE TYPE public.connector_category AS ENUM ('online_store','invoicing','payments','accounting','calendar','email','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) connector_definitions (catálogo da plataforma)
CREATE TABLE public.connector_definitions (
  key text PRIMARY KEY,
  name text NOT NULL,
  category public.connector_category NOT NULL,
  description text,
  config_schema jsonb NOT NULL DEFAULT '{"fields":[]}'::jsonb,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.connector_definitions TO authenticated;
GRANT ALL ON public.connector_definitions TO service_role;
ALTER TABLE public.connector_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "definitions_read_authenticated" ON public.connector_definitions
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_connector_definitions_touch
  BEFORE UPDATE ON public.connector_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed
INSERT INTO public.connector_definitions (key, name, category, description, config_schema) VALUES
  ('stripe', 'Stripe', 'payments', 'Pagamentos via Stripe',
   '{"fields":[
      {"key":"account_label","label":"Etiqueta da conta","type":"text","required":false,"secret":false},
      {"key":"publishable_key","label":"Chave publicável","type":"text","required":false,"secret":false},
      {"key":"secret_key","label":"Chave secreta (sk_...)","type":"password","required":true,"secret":true}
   ]}'::jsonb),
  ('generic_webhook_invoicing', 'Webhook de faturação (genérico)', 'invoicing', 'Envia faturas para um endpoint HTTP genérico',
   '{"fields":[
      {"key":"target_url","label":"URL de destino","type":"url","required":true,"secret":false},
      {"key":"auth_header","label":"Cabeçalho de autenticação (ex.: Bearer ...)","type":"password","required":false,"secret":true}
   ]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) connections (instância por organização)
CREATE TABLE public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_key text NOT NULL REFERENCES public.connector_definitions(key),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('active','disabled','error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connector_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;
GRANT ALL ON public.connections TO service_role;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connections_admin_select" ON public.connections
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY "connections_admin_insert" ON public.connections
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "connections_admin_update" ON public.connections
  FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "connections_admin_delete" ON public.connections
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));
CREATE TRIGGER trg_connections_touch
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_connections_org ON public.connections(organization_id);

-- 3) connection_secrets (encriptado em repouso pelas edge functions; SEM acesso a clientes)
CREATE TABLE public.connection_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  key text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, key)
);
-- Sem GRANT a anon/authenticated — só service_role
GRANT ALL ON public.connection_secrets TO service_role;
ALTER TABLE public.connection_secrets ENABLE ROW LEVEL SECURITY;
-- Sem políticas: nenhum acesso a authenticated/anon. Apenas service_role (bypass RLS).
CREATE TRIGGER trg_connection_secrets_touch
  BEFORE UPDATE ON public.connection_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) external_refs (mapeamento ID interno ↔ externo)
CREATE TABLE public.external_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_key text NOT NULL REFERENCES public.connector_definitions(key),
  entity_type text NOT NULL CHECK (entity_type IN ('customer','product','order','invoice','payment')),
  entity_id uuid NOT NULL,
  external_id text NOT NULL,
  external_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connector_key, entity_type, entity_id),
  UNIQUE (organization_id, connector_key, entity_type, external_id)
);
GRANT SELECT ON public.external_refs TO authenticated;
GRANT ALL ON public.external_refs TO service_role;
ALTER TABLE public.external_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "external_refs_member_select" ON public.external_refs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE INDEX idx_external_refs_org_entity ON public.external_refs(organization_id, entity_type, entity_id);

-- 5) webhook_endpoints
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks_admin_select" ON public.webhook_endpoints
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY "webhooks_admin_insert" ON public.webhook_endpoints
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "webhooks_admin_update" ON public.webhook_endpoints
  FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "webhooks_admin_delete" ON public.webhook_endpoints
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));
CREATE TRIGGER trg_webhook_endpoints_touch
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) sync_logs
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_key text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  entity_type text,
  action text,
  status text NOT NULL CHECK (status IN ('success','error')),
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_logs_admin_select" ON public.sync_logs
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE INDEX idx_sync_logs_org_created ON public.sync_logs(organization_id, created_at DESC);
