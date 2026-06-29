-- ========= CUSTOMERS =========
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  vat_number text,
  country text,
  customer_type text,
  segment text,
  assigned_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  address text,
  city text,
  postal_code text,
  notes_short text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org_idx ON public.customers(organization_id);
CREATE INDEX customers_org_name_idx ON public.customers(organization_id, name);
CREATE INDEX customers_assigned_idx ON public.customers(assigned_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  )
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========= CUSTOMER TAG DEFINITIONS =========
CREATE TABLE public.customer_tag_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX ctd_org_idx ON public.customer_tag_definitions(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_definitions TO authenticated;
GRANT ALL ON public.customer_tag_definitions TO service_role;
ALTER TABLE public.customer_tag_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctd_select" ON public.customer_tag_definitions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "ctd_insert" ON public.customer_tag_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY "ctd_update" ON public.customer_tag_definitions
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
    )
  )
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "ctd_delete" ON public.customer_tag_definitions
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- ========= CUSTOMER NOTES =========
CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  content text NOT NULL,
  note_type text NOT NULL DEFAULT 'nota',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cn_org_idx ON public.customer_notes(organization_id);
CREATE INDEX cn_customer_idx ON public.customer_notes(customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cn_select" ON public.customer_notes
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "cn_insert" ON public.customer_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "cn_update" ON public.customer_notes
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "cn_delete" ON public.customer_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id));
