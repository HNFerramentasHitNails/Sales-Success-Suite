
-- Modular system foundation (Fase 1): adicionar tabelas + RLS + seed.
-- 1) organization_modules
CREATE TABLE IF NOT EXISTS public.organization_modules (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
GRANT ALL ON public.organization_modules TO service_role;

ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_modules_select" ON public.organization_modules;
CREATE POLICY "org_modules_select" ON public.organization_modules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "org_modules_insert" ON public.organization_modules;
CREATE POLICY "org_modules_insert" ON public.organization_modules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "org_modules_update" ON public.organization_modules;
CREATE POLICY "org_modules_update" ON public.organization_modules
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "org_modules_delete" ON public.organization_modules;
CREATE POLICY "org_modules_delete" ON public.organization_modules
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_organization_modules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_organization_modules_touch ON public.organization_modules;
CREATE TRIGGER trg_organization_modules_touch
  BEFORE UPDATE ON public.organization_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_organization_modules();

-- 2) access_group_modules (RBAC por módulo)
CREATE TABLE IF NOT EXISTS public.access_group_modules (
  access_group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (access_group_id, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_group_modules TO authenticated;
GRANT ALL ON public.access_group_modules TO service_role;

ALTER TABLE public.access_group_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agm_select" ON public.access_group_modules;
CREATE POLICY "agm_select" ON public.access_group_modules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.access_groups ag
     WHERE ag.id = access_group_id
       AND (public.is_org_member(ag.organization_id) OR public.is_platform_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS "agm_write" ON public.access_group_modules;
CREATE POLICY "agm_write" ON public.access_group_modules
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.access_groups ag
     WHERE ag.id = access_group_id
       AND (public.is_org_admin(auth.uid(), ag.organization_id) OR public.is_platform_admin(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.access_groups ag
     WHERE ag.id = access_group_id
       AND (public.is_org_admin(auth.uid(), ag.organization_id) OR public.is_platform_admin(auth.uid()))
  ));

-- 3) Seed: para todas as organizações existentes, ligar todos os módulos do catálogo.
WITH catalog(module_id) AS (
  VALUES ('sales'),('ai_agents'),('distribution'),
         ('moloni'),('odoo'),('shopify'),('google_calendar'),('stripe')
)
INSERT INTO public.organization_modules (organization_id, module_id, enabled)
SELECT o.id, c.module_id, true
  FROM public.organizations o
  CROSS JOIN catalog c
ON CONFLICT (organization_id, module_id) DO NOTHING;

-- 4) Trigger: novas organizações recebem todos os módulos ligados por omissão.
CREATE OR REPLACE FUNCTION public.seed_default_organization_modules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_modules (organization_id, module_id, enabled)
  VALUES
    (NEW.id, 'sales', true),
    (NEW.id, 'ai_agents', true),
    (NEW.id, 'distribution', true),
    (NEW.id, 'moloni', true),
    (NEW.id, 'odoo', true),
    (NEW.id, 'shopify', true),
    (NEW.id, 'google_calendar', true),
    (NEW.id, 'stripe', true)
  ON CONFLICT (organization_id, module_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_default_organization_modules ON public.organizations;
CREATE TRIGGER trg_seed_default_organization_modules
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_organization_modules();
