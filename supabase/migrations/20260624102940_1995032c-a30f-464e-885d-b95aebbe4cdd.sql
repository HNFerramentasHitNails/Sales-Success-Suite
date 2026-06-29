GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid)  TO service_role, authenticated;