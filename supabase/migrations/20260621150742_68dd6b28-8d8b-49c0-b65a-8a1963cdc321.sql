ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vat_category text NOT NULL DEFAULT 'normal';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 23;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vat_regime text;

CREATE TABLE IF NOT EXISTS public.vat_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  country text NOT NULL,
  standard numeric NOT NULL DEFAULT 0,
  reduced numeric,
  intermediate numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, country)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vat_rates TO authenticated;
GRANT ALL ON public.vat_rates TO service_role;

ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY vat_rates_select ON public.vat_rates FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY vat_rates_insert ON public.vat_rates FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY vat_rates_update ON public.vat_rates FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY vat_rates_delete ON public.vat_rates FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS vat_rates_touch_updated_at ON public.vat_rates;
CREATE TRIGGER vat_rates_touch_updated_at BEFORE UPDATE ON public.vat_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.vat_rates (organization_id, country, standard, reduced, intermediate) VALUES
  ('2e4d48fd-89ac-443a-bd76-12353395258d','PT',23,6,13),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','ES',21,10,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','FR',20,5.5,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','DE',19,7,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','IT',22,10,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','NL',21,9,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','BE',21,6,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','IE',23,13.5,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','LU',17,8,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','AT',20,10,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','PL',23,8,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','SE',25,12,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','DK',25,NULL,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','FI',25.5,14,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','GR',24,13,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','CZ',21,12,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','RO',19,9,NULL),
  ('2e4d48fd-89ac-443a-bd76-12353395258d','HU',27,5,NULL)
ON CONFLICT (organization_id, country) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_order(p_order uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord public.orders;
  v_inv_id uuid;
  v_number text;
BEGIN
  SELECT * INTO v_ord FROM public.orders WHERE id = p_order;
  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT (public.is_org_member(v_ord.organization_id) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_ord.invoice_id IS NOT NULL THEN
    RETURN v_ord.invoice_id;
  END IF;

  v_number := 'RAS-' || to_char(now(), 'YYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 5);

  INSERT INTO public.invoices (
    organization_id, customer_id, customer_name_raw,
    invoice_number, issue_date, status, source,
    subtotal, tax_total, total, currency,
    category, sales_rep_id, notes
  ) VALUES (
    v_ord.organization_id, v_ord.customer_id, v_ord.customer_name_raw,
    v_number, COALESCE(v_ord.order_date::date, current_date), 'draft', 'hub',
    COALESCE(v_ord.subtotal, 0), COALESCE(v_ord.tax_total, 0), COALESCE(v_ord.total, 0),
    COALESCE(v_ord.currency, 'EUR'),
    v_ord.category, v_ord.sales_rep_id, v_ord.notes
  )
  RETURNING id INTO v_inv_id;

  INSERT INTO public.invoice_items (
    organization_id, invoice_id, product_id,
    product_name_raw, product_sku_raw,
    quantity, unit_price, tax_rate, line_total
  )
  SELECT
    v_ord.organization_id, v_inv_id, oi.product_id,
    oi.description,
    p.sku,
    oi.quantity, oi.unit_price, oi.tax_rate, oi.line_total
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order
  ORDER BY oi.position;

  UPDATE public.orders SET invoice_id = v_inv_id WHERE id = p_order;

  RETURN v_inv_id;
END;
$function$;
