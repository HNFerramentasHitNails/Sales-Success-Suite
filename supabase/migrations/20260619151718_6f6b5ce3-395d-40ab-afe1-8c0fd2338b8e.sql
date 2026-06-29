
REVOKE EXECUTE ON FUNCTION public.merge_customers(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid) TO authenticated;
