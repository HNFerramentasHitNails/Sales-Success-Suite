-- ============================================================
-- Pagar encomenda com saldo da carteira do cliente
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wallet_balance_applied numeric(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_cust uuid; v_total numeric; v_applied numeric; v_status order_status; v_num text;
  v_bal numeric; v_amount numeric;
BEGIN
  SELECT organization_id, customer_id, total, COALESCE(wallet_balance_applied, 0), status, order_number
    INTO v_org, v_cust, v_total, v_applied, v_status, v_num
    FROM public.orders WHERE id = _order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org AND user_id = auth.uid() AND status = 'active' AND role <> 'read_only'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status IN ('paga', 'faturada', 'cancelada') THEN RAISE EXCEPTION 'order_not_payable'; END IF;
  IF EXISTS (SELECT 1 FROM public.customer_wallet_transactions WHERE source_type = 'order' AND source_id = _order_id) THEN
    RAISE EXCEPTION 'already_applied';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_bal FROM public.customer_wallets
   WHERE organization_id = v_org AND customer_id = v_cust;
  v_bal := COALESCE(v_bal, 0);
  v_amount := LEAST(v_bal, v_total - v_applied);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'no_balance'; END IF;

  PERFORM public.wallet_debit(v_org, v_cust, v_amount, 'order', _order_id, 'Pagamento da encomenda ' || COALESCE(v_num, ''));

  UPDATE public.orders
     SET wallet_balance_applied = v_applied + v_amount,
         status  = CASE WHEN (v_applied + v_amount) >= v_total THEN 'paga'::order_status ELSE status END,
         paid_at = CASE WHEN (v_applied + v_amount) >= v_total THEN now() ELSE paid_at END
   WHERE id = _order_id;

  RETURN jsonb_build_object('applied', v_amount, 'fully_paid', (v_applied + v_amount) >= v_total, 'remaining', GREATEST(v_total - v_applied - v_amount, 0));
END $$;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid) TO authenticated;
