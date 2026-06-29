CREATE OR REPLACE FUNCTION public.import_orders(p_org uuid, p_rows jsonb, p_match text DEFAULT 'email', p_status text DEFAULT 'paga')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r jsonb; v_match text; v_cust uuid; v_date date; v_val numeric; v_num text; v_oid uuid; v_cur text;
  ins int:=0; sk_cust int:=0; sk_dup int:=0; sk_bad int:=0;
  touched uuid[] := '{}'; uid uuid;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.has_org_role(p_org,'sales_director') OR public.is_org_member(p_org)) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'p_rows tem de ser um array'; END IF;
  SELECT currency INTO v_cur FROM public.organizations WHERE id=p_org;
  v_cur := COALESCE(v_cur,'EUR');

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS value LOOP
    v_match := nullif(btrim(r->>'customer'),'');
    IF p_match IN ('email') THEN v_match := lower(v_match); END IF;
    BEGIN v_date := (nullif(btrim(r->>'order_date'),''))::date; EXCEPTION WHEN others THEN v_date := NULL; END;
    BEGIN v_val := (nullif(btrim(r->>'value'),''))::numeric; EXCEPTION WHEN others THEN v_val := NULL; END;
    v_num := nullif(btrim(r->>'order_number'),'');

    IF v_match IS NULL OR v_date IS NULL OR v_val IS NULL THEN sk_bad:=sk_bad+1; CONTINUE; END IF;

    SELECT id INTO v_cust FROM public.customers
     WHERE organization_id=p_org AND CASE p_match
            WHEN 'email' THEN lower(email)=v_match
            WHEN 'phone' THEN phone=v_match
            WHEN 'vat_number' THEN vat_number=v_match
            WHEN 'name' THEN lower(name)=lower(v_match)
            ELSE false END
     LIMIT 1;
    IF v_cust IS NULL THEN sk_cust:=sk_cust+1; CONTINUE; END IF;

    IF v_num IS NOT NULL AND EXISTS(SELECT 1 FROM public.orders WHERE organization_id=p_org AND order_number=v_num) THEN
      sk_dup:=sk_dup+1; CONTINUE;
    END IF;
    IF v_num IS NULL THEN v_num := public.next_order_number(p_org); END IF;

    INSERT INTO public.orders(organization_id, order_number, customer_id, status, order_date, currency, created_by)
    VALUES(p_org, v_num, v_cust, p_status::order_status, v_date, v_cur, auth.uid())
    RETURNING id INTO v_oid;

    INSERT INTO public.order_lines(organization_id, order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent)
    VALUES(p_org, v_oid, NULL, 'Histórico importado', 1, v_val, 0, 0);

    IF NOT (v_cust = ANY(touched)) THEN touched := array_append(touched, v_cust); END IF;
    ins:=ins+1;
  END LOOP;

  FOREACH uid IN ARRAY touched LOOP
    PERFORM public.recompute_customer_metrics(p_org, uid);
    PERFORM public.compute_customer_rfm(p_org, uid);
  END LOOP;

  RETURN jsonb_build_object('inserted',ins,'no_customer',sk_cust,'duplicates',sk_dup,'invalid',sk_bad,
                            'customers_touched',COALESCE(array_length(touched,1),0),'total',jsonb_array_length(p_rows));
END $$;

GRANT EXECUTE ON FUNCTION public.import_orders(uuid,jsonb,text,text) TO authenticated;