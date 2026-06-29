CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_campaigns TO authenticated;
GRANT ALL ON public.promo_campaigns TO service_role;
ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_campaigns' AND policyname='promo_campaigns_select') THEN
    CREATE POLICY promo_campaigns_select ON public.promo_campaigns FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_campaigns' AND policyname='promo_campaigns_insert') THEN
    CREATE POLICY promo_campaigns_insert ON public.promo_campaigns FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_campaigns' AND policyname='promo_campaigns_update') THEN
    CREATE POLICY promo_campaigns_update ON public.promo_campaigns FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director')) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_campaigns' AND policyname='promo_campaigns_delete') THEN
    CREATE POLICY promo_campaigns_delete ON public.promo_campaigns FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_promo_campaigns_updated ON public.promo_campaigns;
CREATE TRIGGER trg_promo_campaigns_updated BEFORE UPDATE ON public.promo_campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.promo_discount_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns(id) ON DELETE CASCADE,
  price_group_id uuid NOT NULL REFERENCES public.price_groups(id) ON DELETE CASCADE,
  customer_class_id uuid NOT NULL REFERENCES public.customer_classes(id) ON DELETE CASCADE,
  discount_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_cell ON public.promo_discount_cells(campaign_id, price_group_id, customer_class_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_discount_cells TO authenticated;
GRANT ALL ON public.promo_discount_cells TO service_role;
ALTER TABLE public.promo_discount_cells ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_discount_cells' AND policyname='promo_cells_select') THEN
    CREATE POLICY promo_cells_select ON public.promo_discount_cells FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_discount_cells' AND policyname='promo_cells_insert') THEN
    CREATE POLICY promo_cells_insert ON public.promo_discount_cells FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_discount_cells' AND policyname='promo_cells_update') THEN
    CREATE POLICY promo_cells_update ON public.promo_discount_cells FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director')) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promo_discount_cells' AND policyname='promo_cells_delete') THEN
    CREATE POLICY promo_cells_delete ON public.promo_discount_cells FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_promo_cells_updated ON public.promo_discount_cells;
CREATE TRIGGER trg_promo_cells_updated BEFORE UPDATE ON public.promo_discount_cells FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_line_discount(p_customer_id uuid, p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_class uuid; v_group uuid; v_base numeric; v_promo numeric;
BEGIN
  SELECT organization_id, customer_class_id INTO v_org, v_class FROM public.customers WHERE id=p_customer_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_org_member(v_org) THEN RETURN 0; END IF;
  SELECT price_group_id INTO v_group FROM public.products WHERE id=p_product_id;
  v_base := NULL;
  IF v_group IS NOT NULL AND v_class IS NOT NULL THEN
    SELECT discount_percent INTO v_base FROM public.discount_matrix
     WHERE organization_id=v_org AND price_group_id=v_group AND customer_class_id=v_class;
  END IF;
  IF v_base IS NULL AND v_class IS NOT NULL THEN
    SELECT default_discount_percent INTO v_base FROM public.customer_classes WHERE id=v_class;
  END IF;
  v_base := COALESCE(v_base,0);
  v_promo := 0;
  IF v_group IS NOT NULL AND v_class IS NOT NULL THEN
    SELECT COALESCE(MAX(pc.discount_percent),0) INTO v_promo
      FROM public.promo_discount_cells pc
      JOIN public.promo_campaigns c ON c.id=pc.campaign_id
     WHERE pc.organization_id=v_org AND pc.price_group_id=v_group AND pc.customer_class_id=v_class
       AND c.is_active AND current_date BETWEEN c.start_date AND c.end_date;
  END IF;
  RETURN GREATEST(v_base, COALESCE(v_promo,0));
END $$;
GRANT EXECUTE ON FUNCTION public.get_line_discount(uuid,uuid) TO authenticated, service_role;