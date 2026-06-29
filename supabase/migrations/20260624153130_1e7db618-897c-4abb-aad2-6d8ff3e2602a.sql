CREATE OR REPLACE FUNCTION public.merge_customers(p_primary uuid, p_secondary uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_org2 uuid; v_pw uuid; v_sbal numeric;
        n_orders int; n_invoices int; n_calls int;
BEGIN
  IF p_primary = p_secondary THEN RAISE EXCEPTION 'O cliente a manter e a remover são o mesmo'; END IF;
  SELECT organization_id INTO v_org  FROM public.customers WHERE id=p_primary;
  SELECT organization_id INTO v_org2 FROM public.customers WHERE id=p_secondary;
  IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  IF v_org <> v_org2 THEN RAISE EXCEPTION 'Clientes de organizações diferentes'; END IF;
  IF NOT (public.is_org_admin(v_org) OR public.has_org_role(v_org,'sales_director')) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  INSERT INTO public.customer_wallets(organization_id, customer_id, balance, currency)
    SELECT v_org, p_primary, 0, COALESCE((SELECT currency FROM public.customer_wallets WHERE customer_id=p_secondary),'EUR')
    WHERE NOT EXISTS (SELECT 1 FROM public.customer_wallets WHERE customer_id=p_primary);
  SELECT id INTO v_pw FROM public.customer_wallets WHERE customer_id=p_primary;
  SELECT COALESCE(balance,0) INTO v_sbal FROM public.customer_wallets WHERE customer_id=p_secondary;
  UPDATE public.customer_wallet_transactions SET customer_id=p_primary, wallet_id=v_pw WHERE customer_id=p_secondary;
  IF v_sbal IS NOT NULL AND v_sbal <> 0 THEN
    UPDATE public.customer_wallets SET balance=COALESCE(balance,0)+v_sbal, updated_at=now() WHERE id=v_pw;
  END IF;
  DELETE FROM public.customer_wallets WHERE customer_id=p_secondary;

  UPDATE public.activities              SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.customer_notes          SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.distribution_partners   SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.invoices                SET customer_id=p_primary WHERE customer_id=p_secondary;
  GET DIAGNOSTICS n_invoices = ROW_COUNT;
  UPDATE public.issues                  SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.orders                  SET customer_id=p_primary WHERE customer_id=p_secondary;
  GET DIAGNOSTICS n_orders = ROW_COUNT;
  UPDATE public.prospects               SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.recurring_subscriptions SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.rma                     SET customer_id=p_primary WHERE customer_id=p_secondary;
  UPDATE public.sales_calls             SET customer_id=p_primary WHERE customer_id=p_secondary;
  GET DIAGNOSTICS n_calls = ROW_COUNT;
  UPDATE public.vouchers                SET customer_id=p_primary WHERE customer_id=p_secondary;

  DELETE FROM public.customers WHERE id=p_secondary;
  PERFORM public.recompute_customer_metrics(v_org, p_primary);
  PERFORM public.compute_customer_rfm(v_org, p_primary);

  RETURN jsonb_build_object('ok',true,'orders',n_orders,'invoices',n_invoices,'calls',n_calls,'wallet_moved',COALESCE(v_sbal,0));
END $$;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid,uuid) TO authenticated;