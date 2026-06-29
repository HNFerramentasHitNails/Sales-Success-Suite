
-- Hierarchical customer tags
CREATE TABLE public.customer_tag_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES public.customer_tag_definitions(id) ON DELETE CASCADE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.customer_tag_definitions(organization_id);
CREATE INDEX ON public.customer_tag_definitions(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_definitions TO authenticated;
GRANT ALL ON public.customer_tag_definitions TO service_role;
SELECT public.apply_tenant_rls('public.customer_tag_definitions');
CREATE TRIGGER touch_customer_tag_definitions BEFORE UPDATE ON public.customer_tag_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.customer_tag_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.customer_tag_definitions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, tag_id)
);
CREATE INDEX ON public.customer_tag_links(organization_id);
CREATE INDEX ON public.customer_tag_links(customer_id);
CREATE INDEX ON public.customer_tag_links(tag_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_links TO authenticated;
GRANT ALL ON public.customer_tag_links TO service_role;
SELECT public.apply_tenant_rls('public.customer_tag_links');

-- Lead scoring config
CREATE TABLE public.lead_scoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  weights jsonb NOT NULL DEFAULT '{"value":0.4,"recency":0.25,"engagement":0.2,"stage":0.15}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_scoring_config TO authenticated;
GRANT ALL ON public.lead_scoring_config TO service_role;
SELECT public.apply_tenant_rls('public.lead_scoring_config');
CREATE TRIGGER touch_lead_scoring_config BEFORE UPDATE ON public.lead_scoring_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
