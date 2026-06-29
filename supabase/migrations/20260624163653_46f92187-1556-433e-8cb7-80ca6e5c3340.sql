CREATE TABLE IF NOT EXISTS public.sales_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_channels_org_idx ON public.sales_channels(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_channels TO authenticated;
GRANT ALL ON public.sales_channels TO service_role;

CREATE TABLE IF NOT EXISTS public.product_sales_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.sales_channels(id) ON DELETE CASCADE,
  channel_sku text,
  channel_price numeric(14,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, channel_id)
);
CREATE INDEX IF NOT EXISTS psc_product_idx ON public.product_sales_channels(product_id);
CREATE INDEX IF NOT EXISTS psc_channel_idx ON public.product_sales_channels(channel_id);

GRANT SELECT ON public.product_sales_channels TO authenticated;
GRANT ALL ON public.product_sales_channels TO service_role;

ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sales_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sc_sel ON public.sales_channels;
CREATE POLICY sc_sel ON public.sales_channels FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS sc_wr ON public.sales_channels;
CREATE POLICY sc_wr ON public.sales_channels FOR ALL
  USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=sales_channels.organization_id AND om.user_id=auth.uid() AND om.status='active' AND om.role <> 'read_only'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=sales_channels.organization_id AND om.user_id=auth.uid() AND om.status='active' AND om.role <> 'read_only'));

DROP POLICY IF EXISTS psc_sel ON public.product_sales_channels;
CREATE POLICY psc_sel ON public.product_sales_channels FOR SELECT USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.set_product_channels(p_product uuid, p_channels jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; n int := 0; elem jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM public.products WHERE id=p_product;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=v_org AND user_id=auth.uid() AND status='active' AND role <> 'read_only') THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  DELETE FROM public.product_sales_channels WHERE product_id=p_product;
  IF p_channels IS NOT NULL THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(p_channels) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.sales_channels sc WHERE sc.id=(elem->>'channel_id')::uuid AND sc.organization_id=v_org) THEN
        RAISE EXCEPTION 'Canal inválido';
      END IF;
      INSERT INTO public.product_sales_channels(organization_id, product_id, channel_id, channel_sku, channel_price)
      VALUES (v_org, p_product, (elem->>'channel_id')::uuid,
              NULLIF(elem->>'channel_sku',''),
              CASE WHEN COALESCE(elem->>'channel_price','')='' THEN NULL ELSE (elem->>'channel_price')::numeric END);
      n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.set_product_channels(uuid,jsonb) TO authenticated;