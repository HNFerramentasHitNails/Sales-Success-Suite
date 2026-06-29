-- ============= CUSTOMERS =============
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  tax_id TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT,
  notes TEXT,
  assigned_to UUID,
  external_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_org ON public.customers(organization_id);
CREATE INDEX idx_customers_assigned ON public.customers(assigned_to);
CREATE INDEX idx_customers_tax_id ON public.customers(organization_id, tax_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select_same_org ON public.customers FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY customers_insert_member ON public.customers FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY customers_update_member ON public.customers FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= PRODUCTS =============
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_org ON public.products(organization_id);
CREATE UNIQUE INDEX idx_products_org_sku ON public.products(organization_id, sku) WHERE sku IS NOT NULL;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select_same_org ON public.products FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY products_insert_admin ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY products_update_admin ON public.products FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY products_delete_admin ON public.products FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= PRODUCT KNOWLEDGE =============
CREATE TABLE public.product_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  selling_points TEXT,
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  objections JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_audience TEXT,
  positioning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_product_knowledge_product ON public.product_knowledge(product_id);
CREATE INDEX idx_product_knowledge_org ON public.product_knowledge(organization_id);

ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY pk_select_same_org ON public.product_knowledge FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY pk_insert_admin ON public.product_knowledge FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY pk_update_admin ON public.product_knowledge FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY pk_delete_admin ON public.product_knowledge FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER product_knowledge_touch BEFORE UPDATE ON public.product_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= INVOICES =============
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'issued',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  customer_name_raw TEXT,
  customer_tax_id_raw TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  imported_by UUID,
  imported_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE UNIQUE INDEX idx_invoices_org_number ON public.invoices(organization_id, invoice_number);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select_same_org ON public.invoices FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY invoices_insert_member ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY invoices_update_member ON public.invoices FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY invoices_delete_admin ON public.invoices FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= INVOICE ITEMS =============
CREATE TABLE public.invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_raw TEXT NOT NULL,
  product_sku_raw TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON public.invoice_items(product_id);
CREATE INDEX idx_invoice_items_org ON public.invoice_items(organization_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY ii_select_same_org ON public.invoice_items FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY ii_insert_member ON public.invoice_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY ii_update_member ON public.invoice_items FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY ii_delete_admin ON public.invoice_items FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));
