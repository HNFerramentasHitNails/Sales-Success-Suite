-- Reembolso automático via Stripe para notas de crédito com refund_method='original'.
-- Guarda a referência do reembolso Stripe/carteira e finaliza atomicamente (idempotente).

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS refund_reference text;

CREATE OR REPLACE FUNCTION public.finalize_credit_note_refund(_credit_note_id uuid, _wallet_amount numeric, _refund_reference text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cn record;
BEGIN
  SELECT id, organization_id, customer_id, credit_note_number, refund_status, refund_method
    INTO v_cn FROM public.credit_notes WHERE id = _credit_note_id FOR UPDATE;
  IF v_cn.id IS NULL THEN RAISE EXCEPTION 'credit_note_not_found'; END IF;
  IF v_cn.refund_method <> 'original' THEN RAISE EXCEPTION 'not_original_method'; END IF;
  IF v_cn.refund_status = 'done' THEN RETURN; END IF; -- idempotente: já finalizado
  IF v_cn.refund_status <> 'pending' THEN RAISE EXCEPTION 'invalid_refund_status'; END IF;

  IF COALESCE(_wallet_amount, 0) > 0 AND v_cn.customer_id IS NOT NULL THEN
    PERFORM public._wallet_credit_system(v_cn.organization_id, v_cn.customer_id, _wallet_amount,
            'refund', v_cn.id, 'Reembolso (parte carteira) ' || v_cn.credit_note_number);
  END IF;

  UPDATE public.credit_notes
     SET refund_status = 'done', refund_reference = _refund_reference, updated_at = now()
   WHERE id = _credit_note_id;
END
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_credit_note_refund(uuid, numeric, text) TO service_role;
