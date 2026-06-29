CREATE OR REPLACE FUNCTION public.cancel_invoice_on_order_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelada'
     AND COALESCE(OLD.status,'') <> 'cancelada'
     AND NEW.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
       SET status = 'cancelled'
     WHERE id = NEW.invoice_id
       AND status NOT IN ('issued','paid','cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_invoice_on_order_cancel ON public.orders;
CREATE TRIGGER trg_cancel_invoice_on_order_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'cancelada')
EXECUTE FUNCTION public.cancel_invoice_on_order_cancel();