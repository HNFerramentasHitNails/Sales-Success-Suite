ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shipping_cost numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_order(p_order uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ord public.orders;
  v_inv_id uuid;
  v_number text;
  v_regime text;
  v_country text;
  v_porte_rate numeric;
BEGIN
  SELECT * INTO v_ord FROM public.orders WHERE id = p_order;
  IF v_ord.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT (public.is_org_member(v_ord.organization_id) OR public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_ord.invoice_id IS NOT NULL THEN RETURN v_ord.invoice_id; END IF;
  v_number := 'RAS-' || to_char(now(), 'YYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 5);

  INSERT INTO public.invoices (organization_id, customer_id, customer_name_raw, invoice_number, issue_date, status, source, subtotal, tax_total, total, currency, category, sales_rep_id, notes, shipping_cost)
  VALUES (v_ord.organization_id, v_ord.customer_id, v_ord.customer_name_raw, v_number, COALESCE(v_ord.order_date::date, current_date), 'draft', 'hub', COALESCE(v_ord.subtotal,0), COALESCE(v_ord.tax_total,0), COALESCE(v_ord.total,0), COALESCE(v_ord.currency,'EUR'), v_ord.category, v_ord.sales_rep_id, v_ord.notes, COALESCE(v_ord.shipping_cost,0))
  RETURNING id INTO v_inv_id;

  INSERT INTO public.invoice_items (organization_id, invoice_id, product_id, product_name_raw, product_sku_raw, quantity, unit_price, tax_rate, line_total)
  SELECT v_ord.organization_id, v_inv_id, oi.product_id, oi.description, p.sku, oi.quantity, oi.unit_price, oi.tax_rate, oi.line_total
  FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order ORDER BY oi.position;

  IF COALESCE(v_ord.shipping_cost,0) > 0 THEN
    v_regime := COALESCE(v_ord.vat_regime,'interno');
    IF v_regime IN ('isento_ue_b2b','exportacao') THEN
      v_porte_rate := 0;
    ELSE
      IF v_regime = 'oss_ue_b2c' THEN
        v_country := upper(coalesce((v_ord.shipping_address)::jsonb->>'country','PT'));
      ELSE
        v_country := 'PT';
      END IF;
      SELECT standard INTO v_porte_rate FROM public.vat_rates WHERE organization_id = v_ord.organization_id AND country = v_country AND active LIMIT 1;
      v_porte_rate := COALESCE(v_porte_rate, 23);
    END IF;
    INSERT INTO public.invoice_items (organization_id, invoice_id, product_id, product_name_raw, product_sku_raw, quantity, unit_price, tax_rate, line_total)
    VALUES (v_ord.organization_id, v_inv_id, NULL, 'Portes', NULL, 1, v_ord.shipping_cost, COALESCE(v_porte_rate,0), v_ord.shipping_cost);
  END IF;

  UPDATE public.orders SET invoice_id = v_inv_id WHERE id = p_order;
  RETURN v_inv_id;
END;
$function$;