REVOKE EXECUTE ON FUNCTION public.next_order_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_order_totals() FROM PUBLIC, anon, authenticated;
