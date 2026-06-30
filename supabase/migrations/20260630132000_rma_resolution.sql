-- Tarefa 2 (brief financeiro) — Regularizar devoluções (nota de crédito + reembolso + stock + comissão).
--
-- Cria a tabela de notas de crédito e a RPC atómica process_rma_resolution que, para uma
-- RMA aprovada: emite nota de crédito (série NC-xxxxx), repõe stock, processa o reembolso
-- (carteira ou marca reembolso ao método original como pendente) e lança a reversão de comissão.
-- Idempotente por rma_id. NÃO faz backfill automático — é acionada deliberadamente na UI.

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rma_id uuid REFERENCES public.rma(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id uuid,
  credit_note_number text,
  connector_key text DEFAULT 'generic_webhook_invoicing',
  external_id text,
  pdf_url text,
  status text NOT NULL DEFAULT 'issued',
  external_status text NOT NULL DEFAULT 'not_synced',
  currency text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  reason text,
  refund_method text,   -- wallet | original | none
  refund_status text,   -- done | pending | none
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_rma ON public.credit_notes(rma_id) WHERE rma_id IS NOT NULL;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_notes_select ON public.credit_notes;
CREATE POLICY credit_notes_select ON public.credit_notes
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.process_rma_resolution(_rma_id uuid, _amount numeric DEFAULT NULL, _refund_method text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rma record; v_order record; v_existing uuid;
  v_amount numeric(14,2); v_ratio numeric; v_sub numeric(14,2); v_tax numeric(14,2);
  v_number text; v_cn_id uuid; v_method text; v_refund_status text;
  v_rate numeric; v_rev numeric(14,2); rec record; v_bal numeric;
BEGIN
  SELECT id, organization_id, customer_id, order_id, status, resolution
    INTO v_rma FROM public.rma WHERE id = _rma_id;
  IF v_rma.id IS NULL THEN RAISE EXCEPTION 'rma_not_found'; END IF;

  -- Acesso: utilizador real tem de ser admin; service_role (auth.uid null) é permitido.
  IF auth.uid() IS NOT NULL AND NOT public.is_org_admin(v_rma.organization_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_rma.status <> 'approved' THEN RAISE EXCEPTION 'rma_not_approved'; END IF;

  -- Idempotência por RMA.
  SELECT id INTO v_existing FROM public.credit_notes WHERE rma_id = _rma_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT id, subtotal, tax_total, total, currency, assigned_member_id, order_number
    INTO v_order FROM public.orders WHERE id = v_rma.order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;

  v_amount := COALESCE(_amount, v_order.total);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_amount > v_order.total THEN v_amount := v_order.total; END IF;
  v_ratio := CASE WHEN v_order.total > 0 THEN v_amount / v_order.total ELSE 1 END;
  v_sub := round(COALESCE(v_order.subtotal, 0) * v_ratio, 2);
  v_tax := round(v_amount - v_sub, 2);

  v_number := public.next_credit_note_number(v_rma.organization_id);

  INSERT INTO public.credit_notes(organization_id, rma_id, order_id, customer_id, credit_note_number,
        status, external_status, currency, subtotal, tax_total, total, reason, created_by)
  VALUES (v_rma.organization_id, _rma_id, v_order.id, v_rma.customer_id, v_number,
        'issued', 'not_synced', v_order.currency, v_sub, v_tax, v_amount,
        'Devolução ' || COALESCE(v_order.order_number, ''), auth.uid())
  RETURNING id INTO v_cn_id;

  -- Reposição de stock (movimentos SEM order_id para não interferir com reconcile_order_stock).
  FOR rec IN
    SELECT ol.product_id AS pid, SUM(ol.quantity * v_ratio) AS qty
      FROM public.order_lines ol JOIN public.products p ON p.id = ol.product_id
     WHERE ol.order_id = v_order.id AND p.tracks_stock = true
     GROUP BY ol.product_id
  LOOP
    UPDATE public.products SET stock_quantity = stock_quantity + rec.qty, updated_at = now()
      WHERE id = rec.pid RETURNING stock_quantity INTO v_bal;
    INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after, notes)
    VALUES (v_rma.organization_id, rec.pid, NULL, rec.qty, 'rma_return', v_bal,
            'Devolução ' || v_number || ' (enc ' || COALESCE(v_order.order_number, '') || ')');
  END LOOP;

  -- Reembolso.
  v_method := COALESCE(_refund_method,
                CASE v_rma.resolution WHEN 'credit' THEN 'wallet'
                                      WHEN 'refund' THEN 'original' ELSE 'none' END);
  IF v_method = 'wallet' AND v_rma.customer_id IS NOT NULL THEN
    PERFORM public._wallet_credit_system(v_rma.organization_id, v_rma.customer_id, v_amount,
            'rma', _rma_id, 'Crédito de devolução ' || v_number);
    v_refund_status := 'done';
  ELSIF v_method = 'original' THEN
    v_refund_status := 'pending';  -- reembolso ao método original processado externamente (Stripe/transferência)
  ELSE
    v_refund_status := 'none';
  END IF;
  UPDATE public.credit_notes SET refund_method = v_method, refund_status = v_refund_status, updated_at = now()
    WHERE id = v_cn_id;

  -- Reversão de comissão (negativa) sobre a base líquida devolvida.
  IF v_order.assigned_member_id IS NOT NULL THEN
    SELECT rate_percent INTO v_rate FROM public.commission_rules
      WHERE organization_id = v_rma.organization_id AND is_active = true
        AND (member_id IS NULL OR member_id = v_order.assigned_member_id)
      ORDER BY priority DESC NULLS LAST, (member_id IS NOT NULL) DESC LIMIT 1;
    v_rev := round(COALESCE(v_sub, 0) * COALESCE(v_rate, 0) / 100, 2);
    IF v_rev > 0 THEN
      INSERT INTO public.commission_adjustments(organization_id, member_id, period_start, period_end, label, amount, notes, created_by)
      VALUES (v_rma.organization_id, v_order.assigned_member_id, current_date, current_date,
              'Reversão devolução ' || v_number, -v_rev,
              'Reversão automática da comissão pela devolução ' || v_number, auth.uid());
    END IF;
  END IF;

  -- Fecha a RMA (deixa de estar pendente de regularização).
  UPDATE public.rma
     SET status = CASE WHEN v_rma.resolution = 'refund' THEN 'refunded' ELSE 'closed' END,
         updated_at = now()
   WHERE id = _rma_id;

  RETURN v_cn_id;
END
$function$;

GRANT EXECUTE ON FUNCTION public.process_rma_resolution(uuid, numeric, text) TO authenticated;
