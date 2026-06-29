-- Products: weight in grams
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_grams numeric NOT NULL DEFAULT 0;

-- Orders: shipping fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_total_g numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_in_store boolean NOT NULL DEFAULT false;

-- Shipping rates
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  carrier text NOT NULL,
  country text NOT NULL DEFAULT 'PT',
  min_weight_g int NOT NULL DEFAULT 0,
  max_weight_g int NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_rates TO authenticated;
GRANT ALL ON public.shipping_rates TO service_role;

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipping_rates_select" ON public.shipping_rates
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "shipping_rates_insert" ON public.shipping_rates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "shipping_rates_update" ON public.shipping_rates
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "shipping_rates_delete" ON public.shipping_rates
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_shipping_rates_touch
  BEFORE UPDATE ON public.shipping_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_shipping_rates_org_country_weight
  ON public.shipping_rates (organization_id, country, min_weight_g);
