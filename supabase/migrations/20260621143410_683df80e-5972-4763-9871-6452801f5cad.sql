CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE CASCADE,
  color text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_categories_select"
  ON public.product_categories FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "product_categories_insert"
  ON public.product_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "product_categories_update"
  ON public.product_categories FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "product_categories_delete"
  ON public.product_categories FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER product_categories_touch_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_product_categories_org_parent ON public.product_categories(organization_id, parent_id);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);