-- Price groups
CREATE TABLE IF NOT EXISTS public.price_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_groups TO authenticated;
GRANT ALL ON public.price_groups TO service_role;
ALTER TABLE public.price_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_groups_select ON public.price_groups;
CREATE POLICY price_groups_select ON public.price_groups FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS price_groups_insert ON public.price_groups;
CREATE POLICY price_groups_insert ON public.price_groups FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS price_groups_update ON public.price_groups;
CREATE POLICY price_groups_update ON public.price_groups FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role)) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS price_groups_delete ON public.price_groups;
CREATE POLICY price_groups_delete ON public.price_groups FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));

-- Customer classes
CREATE TABLE IF NOT EXISTS public.customer_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  default_discount_percent numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_classes TO authenticated;
GRANT ALL ON public.customer_classes TO service_role;
ALTER TABLE public.customer_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_classes_select ON public.customer_classes;
CREATE POLICY customer_classes_select ON public.customer_classes FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS customer_classes_insert ON public.customer_classes;
CREATE POLICY customer_classes_insert ON public.customer_classes FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS customer_classes_update ON public.customer_classes;
CREATE POLICY customer_classes_update ON public.customer_classes FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role)) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS customer_classes_delete ON public.customer_classes;
CREATE POLICY customer_classes_delete ON public.customer_classes FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));

-- Discount matrix
CREATE TABLE IF NOT EXISTS public.discount_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  price_group_id uuid NOT NULL REFERENCES public.price_groups(id) ON DELETE CASCADE,
  customer_class_id uuid NOT NULL REFERENCES public.customer_classes(id) ON DELETE CASCADE,
  discount_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discount_matrix_cell ON public.discount_matrix(organization_id, price_group_id, customer_class_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_matrix TO authenticated;
GRANT ALL ON public.discount_matrix TO service_role;
ALTER TABLE public.discount_matrix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discount_matrix_select ON public.discount_matrix;
CREATE POLICY discount_matrix_select ON public.discount_matrix FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS discount_matrix_insert ON public.discount_matrix;
CREATE POLICY discount_matrix_insert ON public.discount_matrix FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS discount_matrix_update ON public.discount_matrix;
CREATE POLICY discount_matrix_update ON public.discount_matrix FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role)) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
DROP POLICY IF EXISTS discount_matrix_delete ON public.discount_matrix;
CREATE POLICY discount_matrix_delete ON public.discount_matrix FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));

-- Attribution columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_group_id uuid REFERENCES public.price_groups(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_class_id uuid REFERENCES public.customer_classes(id) ON DELETE SET NULL;

-- Discount resolver
CREATE OR REPLACE FUNCTION public.get_line_discount(p_customer_id uuid, p_product_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_class uuid; v_group uuid; v_disc numeric;
BEGIN
  SELECT organization_id, customer_class_id INTO v_org, v_class FROM public.customers WHERE id=p_customer_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_org_member(v_org) THEN RETURN 0; END IF;
  SELECT price_group_id INTO v_group FROM public.products WHERE id=p_product_id;
  IF v_group IS NOT NULL AND v_class IS NOT NULL THEN
    SELECT discount_percent INTO v_disc FROM public.discount_matrix
     WHERE organization_id=v_org AND price_group_id=v_group AND customer_class_id=v_class;
    IF FOUND THEN RETURN COALESCE(v_disc,0); END IF;
  END IF;
  IF v_class IS NOT NULL THEN
    SELECT default_discount_percent INTO v_disc FROM public.customer_classes WHERE id=v_class;
    RETURN COALESCE(v_disc,0);
  END IF;
  RETURN 0;
END $$;
GRANT EXECUTE ON FUNCTION public.get_line_discount(uuid,uuid) TO authenticated, service_role;