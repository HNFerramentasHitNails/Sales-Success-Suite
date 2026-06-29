
-- ============ distribution_partners ============
CREATE TABLE public.distribution_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'reseller'
    CHECK (type IN ('distributor','reseller','agent','other')),
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect','active','inactive','suspended')),
  region text NULL,
  email text NULL,
  phone text NULL,
  vat_number text NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_to uuid NULL,
  notes text NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dpartners_org_status ON public.distribution_partners(organization_id, status);
CREATE INDEX idx_dpartners_customer ON public.distribution_partners(customer_id) WHERE customer_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_partners TO authenticated;
GRANT ALL ON public.distribution_partners TO service_role;

ALTER TABLE public.distribution_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_select_members" ON public.distribution_partners
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "dp_insert_admin" ON public.distribution_partners
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "dp_update_admin" ON public.distribution_partners
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "dp_delete_admin" ON public.distribution_partners
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE TRIGGER dp_touch_updated_at
  BEFORE UPDATE ON public.distribution_partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ distribution_contracts ============
CREATE TABLE public.distribution_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.distribution_partners(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','expired','terminated')),
  start_date date NULL,
  end_date date NULL,
  commission_pct numeric(6,2) NULL,
  discount_pct numeric(6,2) NULL,
  terms text NULL,
  document_url text NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dcontracts_org_partner ON public.distribution_contracts(organization_id, partner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_contracts TO authenticated;
GRANT ALL ON public.distribution_contracts TO service_role;

ALTER TABLE public.distribution_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dc_select_members" ON public.distribution_contracts
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "dc_insert_admin" ON public.distribution_contracts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "dc_update_admin" ON public.distribution_contracts
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "dc_delete_admin" ON public.distribution_contracts
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE TRIGGER dc_touch_updated_at
  BEFORE UPDATE ON public.distribution_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
