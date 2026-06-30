-- Tarefa 5 (brief financeiro) — Conciliação de pagamentos (faturado vs pago vs Stripe).
--
-- Sinaliza divergências de pagamento sem depender de marcação manual. Neste sistema,
-- 'faturada' é uma fase POSTERIOR a 'paga' (uma encomenda paga e depois faturada mantém
-- paid_at e status='faturada' — isso é correto). Por isso as exceções reais são:
--  - encomenda paga sem paid_at (data em falta);
--  - encomenda faturada com referência Stripe mas sem paid_at (pagamento por confirmar);
--  - encomenda faturada sem qualquer evidência de pagamento (paid_at e ref ambos nulos).
--
-- Nota: não marca nada como pago automaticamente — confirmar no Stripe antes de regularizar.

CREATE OR REPLACE FUNCTION public.get_payment_reconciliation(_org uuid)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  status text,
  invoice_number text,
  payment_ref text,
  paid_at timestamptz,
  total numeric,
  issue text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  SELECT o.id, o.order_number, o.status::text, i.invoice_number, o.payment_ref, o.paid_at, o.total,
         CASE
           WHEN o.status = 'paga' AND o.paid_at IS NULL
             THEN 'pago_sem_data'
           WHEN i.id IS NOT NULL AND i.status = 'issued' AND o.paid_at IS NULL AND o.payment_ref IS NOT NULL
             THEN 'faturada_com_ref_stripe_sem_paid_at'
           WHEN i.id IS NOT NULL AND i.status = 'issued' AND o.paid_at IS NULL AND o.payment_ref IS NULL
             THEN 'faturada_sem_pagamento'
           ELSE NULL
         END AS issue
    FROM public.orders o
    LEFT JOIN public.invoices i ON i.order_id = o.id AND i.status <> 'error'
   WHERE o.organization_id = _org
     AND (
          (o.status = 'paga' AND o.paid_at IS NULL)
       OR (i.id IS NOT NULL AND i.status = 'issued' AND o.paid_at IS NULL)
     )
   ORDER BY o.order_number;
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_payment_reconciliation(uuid) TO authenticated;
