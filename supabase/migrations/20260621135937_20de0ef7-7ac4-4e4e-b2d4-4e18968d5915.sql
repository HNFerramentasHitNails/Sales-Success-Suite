CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_order(p_order uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    oi.quantity, oi.unit_price, 23, oi.line_total
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order
  ORDER BY oi.position;

  UPDATE public.orders SET invoice_id = v_inv_id WHERE id = p_order;

  RETURN v_inv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_order_invoice(p_order uuid, p_to text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ord public.orders;
  v_inv_id uuid;
BEGIN
  IF p_to NOT IN ('to_issue', 'issued') THEN
    RAISE EXCEPTION 'invalid_target_status';
  END IF;

  SELECT * INTO v_ord FROM public.orders WHERE id = p_order;
  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT (public.is_org_member(v_ord.organization_id) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_inv_id := v_ord.invoice_id;
  IF v_inv_id IS NULL THEN
    v_inv_id := public.create_draft_invoice_for_order(p_order);
  END IF;

  IF p_to = 'to_issue' THEN
    UPDATE public.invoices SET status = 'to_issue', updated_at = now() WHERE id = v_inv_id;
  ELSE
    UPDATE public.invoices
       SET status = 'issued', issue_date = current_date, updated_at = now()
     WHERE id = v_inv_id;
    UPDATE public.orders SET status = 'faturada' WHERE id = p_order;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_draft_invoice_for_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_invoice(uuid, text) TO authenticated;
