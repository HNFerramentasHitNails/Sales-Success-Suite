-- Carteira: montante à escolha + ação de reverter + invalidação do link Stripe obsoleto.
--
-- - pay_order_with_wallet(_order_id, _amount): aplica o montante pedido (limitado ao
--   máximo aplicável = min(saldo, em dívida)); por defeito aplica o máximo.
-- - revert_order_wallet(_order_id): devolve o valor ao saldo, remove o débito (permite
--   reaplicar) e, se a carteira tinha pago a encomenda, repõe o estado 'confirmada'.
-- - Ambas invalidam payment_url/payment_ref (o valor em dívida muda → novo link Stripe).

CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(_order_id uuid, _amount numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_cust uuid; v_total numeric; v_applied numeric; v_status order_status; v_num text;
  v_bal numeric; v_max numeric; v_amount numeric;
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
  v_max := LEAST(v_bal, v_total - v_applied);
  IF v_max IS NULL OR v_max <= 0 THEN RAISE EXCEPTION 'no_balance'; END IF;

  v_amount := CASE
    WHEN _amount IS NULL OR _amount <= 0 OR _amount > v_max THEN v_max
    ELSE round(_amount, 2)
  END;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'no_balance'; END IF;

  PERFORM public.wallet_debit(v_org, v_cust, v_amount, 'order', _order_id, 'Pagamento da encomenda ' || COALESCE(v_num, ''));

  UPDATE public.orders
     SET wallet_balance_applied = v_applied + v_amount,
         status  = CASE WHEN (v_applied + v_amount) >= v_total THEN 'paga'::order_status ELSE status END,
         paid_at = CASE WHEN (v_applied + v_amount) >= v_total THEN now() ELSE paid_at END,
         payment_url = NULL,
         payment_ref = CASE WHEN (v_applied + v_amount) >= v_total THEN payment_ref ELSE NULL END
   WHERE id = _order_id;

  RETURN jsonb_build_object('applied', v_amount, 'fully_paid', (v_applied + v_amount) >= v_total, 'remaining', GREATEST(v_total - v_applied - v_amount, 0));
END $function$;

CREATE OR REPLACE FUNCTION public.revert_order_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_cust uuid; v_total numeric; v_applied numeric; v_status order_status; v_bal numeric;
BEGIN
  SELECT organization_id, customer_id, total, COALESCE(wallet_balance_applied, 0), status
    INTO v_org, v_cust, v_total, v_applied, v_status
    FROM public.orders WHERE id = _order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org AND user_id = auth.uid() AND status = 'active' AND role <> 'read_only'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status = 'faturada' THEN RAISE EXCEPTION 'order_invoiced'; END IF;
  IF v_applied <= 0 THEN RAISE EXCEPTION 'no_wallet_applied'; END IF;

  UPDATE public.customer_wallets
     SET balance = COALESCE(balance, 0) + v_applied, updated_at = now()
   WHERE organization_id = v_org AND customer_id = v_cust
   RETURNING balance INTO v_bal;

  DELETE FROM public.customer_wallet_transactions
   WHERE source_type = 'order' AND source_id = _order_id;

  UPDATE public.orders
     SET wallet_balance_applied = 0,
         status  = CASE WHEN v_status = 'paga' AND v_applied >= v_total THEN 'confirmada'::order_status ELSE status END,
         paid_at = CASE WHEN v_status = 'paga' AND v_applied >= v_total THEN NULL ELSE paid_at END,
         payment_url = NULL,
         payment_ref = NULL
   WHERE id = _order_id;

  RETURN jsonb_build_object('reverted', v_applied, 'balance', COALESCE(v_bal, 0));
END $function$;

GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_order_wallet(uuid) TO authenticated;
