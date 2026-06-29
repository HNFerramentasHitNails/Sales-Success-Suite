REVOKE EXECUTE ON FUNCTION public.trigger_auto_invoice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_invoice() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_invoice() FROM authenticated;