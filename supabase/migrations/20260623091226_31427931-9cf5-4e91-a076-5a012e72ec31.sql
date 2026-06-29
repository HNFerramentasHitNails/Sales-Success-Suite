CREATE TYPE public.product_type AS ENUM ('produto','servico','outro');

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  description text,
  product_type public.product_type NOT NULL DEFAULT 'produto',
  category text,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 23,
  is_tax_exempt boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'EUR',
  tracks_stock boolean NOT NULL DEFAULT false,
  stock_quantity numeric(14,3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_org_idx ON public.products(organization_id);
CREATE INDEX products_org_name_idx ON public.products(organization_id, name);
CREATE INDEX products_org_category_idx ON public.products(organization_id, category);
CREATE UNIQUE INDEX products_org_sku_unique
  ON public.products(organization_id, sku)
  WHERE sku IS NOT NULL AND length(trim(sku)) > 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY "products_update" ON public.products
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

CREATE POLICY "products_delete" ON public.products
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
