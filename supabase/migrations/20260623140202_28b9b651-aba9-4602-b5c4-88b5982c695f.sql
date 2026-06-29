CREATE TABLE public.distribution_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NULL,
  min_quantity int NOT NULL DEFAULT 1,
  discount_pct numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_price_tiers TO authenticated;
GRANT ALL ON public.distribution_price_tiers TO service_role;

CREATE INDEX idx_dpt_org_minqty ON public.distribution_price_tiers(organization_id, min_quantity);

ALTER TABLE public.distribution_price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpt_select_members" ON public.distribution_price_tiers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "dpt_insert_admin" ON public.distribution_price_tiers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id)
           OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE POLICY "dpt_update_admin" ON public.distribution_price_tiers
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id)
       OR public.has_org_role(organization_id, 'sales_director'::app_role))
  WITH CHECK (public.is_org_admin(organization_id)
           OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE POLICY "dpt_delete_admin" ON public.distribution_price_tiers
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id)
       OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE TRIGGER trg_dpt_updated_at
  BEFORE UPDATE ON public.distribution_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();